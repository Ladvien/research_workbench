#!/bin/bash

# Runtime Performance Monitoring for Research Workbench
# Monitors actual application performance metrics

set -euo pipefail

# Configuration
DATABASE_URL="${DATABASE_URL:-}"
API_BASE_URL="http://localhost:4512/api"
MONITOR_INTERVAL=10
LOG_FILE="/tmp/workbench_runtime_performance.log"
METRICS_FILE="/tmp/workbench_metrics.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Performance thresholds
API_RESPONSE_THRESHOLD_MS=500
DB_QUERY_THRESHOLD_MS=100
MEMORY_THRESHOLD_PERCENT=85
CPU_THRESHOLD=2.0

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_api_performance() {
    log "Checking API performance..."
    local metrics_json="{}"
    
    # Test health endpoint
    local health_start=$(date +%s.%3N)
    if curl -s "$API_BASE_URL/health" >/dev/null 2>&1; then
        local health_end=$(date +%s.%3N)
        local health_time_ms=$(echo "($health_end - $health_start) * 1000" | bc -l | cut -d. -f1)
        
        if [ "$health_time_ms" -gt $API_RESPONSE_THRESHOLD_MS ]; then
            echo -e "${RED}SLOW: Health endpoint: ${health_time_ms}ms${NC}"
        else
            echo -e "${GREEN}OK: Health endpoint: ${health_time_ms}ms${NC}"
        fi
        
        metrics_json=$(echo "$metrics_json" | jq ".health_response_time_ms = $health_time_ms")
    else
        echo -e "${RED}ERROR: Health endpoint not responding${NC}"
        return 1
    fi
    
    # Test models endpoint
    local models_start=$(date +%s.%3N)
    if curl -s "$API_BASE_URL/models" >/dev/null 2>&1; then
        local models_end=$(date +%s.%3N)
        local models_time_ms=$(echo "($models_end - $models_start) * 1000" | bc -l | cut -d. -f1)
        
        if [ "$models_time_ms" -gt $API_RESPONSE_THRESHOLD_MS ]; then
            echo -e "${RED}SLOW: Models endpoint: ${models_time_ms}ms${NC}"
        else
            echo -e "${GREEN}OK: Models endpoint: ${models_time_ms}ms${NC}"
        fi
        
        metrics_json=$(echo "$metrics_json" | jq ".models_response_time_ms = $models_time_ms")
    else
        echo -e "${YELLOW}INFO: Models endpoint not available${NC}"
    fi
    
    echo "$metrics_json" > "$METRICS_FILE"
}

check_database_performance() {
    if [ -z "$DATABASE_URL" ]; then
        log "WARNING: DATABASE_URL not set, skipping database checks"
        return 0
    fi
    
    log "Checking database performance..."
    
    # Check slow queries from pg_stat_statements
    local slow_queries_result
    slow_queries_result=$(psql "$DATABASE_URL" -t -A -c "
        SELECT 
            COALESCE(COUNT(CASE WHEN mean_exec_time > 100 THEN 1 END), 0) as slow_queries,
            COALESCE(AVG(mean_exec_time), 0) as avg_exec_time,
            COALESCE(MAX(mean_exec_time), 0) as max_exec_time
        FROM pg_stat_statements
        WHERE calls > 10;
    " 2>/dev/null || echo "0|0|0")
    
    IFS='|' read -r slow_queries avg_exec_time max_exec_time <<< "$slow_queries_result"
    
    if [ "$slow_queries" -gt 5 ]; then
        echo -e "${RED}WARNING: $slow_queries slow queries (>100ms average)${NC}"
    else
        echo -e "${GREEN}Database queries OK: $slow_queries slow queries${NC}"
    fi
    
    echo -e "${BLUE}Average query time: ${avg_exec_time}ms, Max: ${max_exec_time}ms${NC}"
    
    # Check connection usage
    local conn_info
    conn_info=$(psql "$DATABASE_URL" -t -A -c "
        SELECT 
            count(*) as total_connections,
            count(CASE WHEN state = 'active' THEN 1 END) as active_connections,
            count(CASE WHEN state = 'idle in transaction' THEN 1 END) as idle_in_transaction
        FROM pg_stat_activity
        WHERE datname = current_database();
    " 2>/dev/null || echo "0|0|0")
    
    IFS='|' read -r total_conn active_conn idle_in_trans <<< "$conn_info"
    
    if [ "$active_conn" -gt 50 ]; then
        echo -e "${RED}HIGH: $active_conn active connections${NC}"
    else
        echo -e "${GREEN}Connections OK: $active_conn active, $total_conn total${NC}"
    fi
    
    if [ "$idle_in_trans" -gt 5 ]; then
        echo -e "${YELLOW}WARNING: $idle_in_trans idle in transaction${NC}"
    fi
    
    # Check for table bloat
    local bloat_check
    bloat_check=$(psql "$DATABASE_URL" -t -A -c "
        SELECT 
            tablename,
            n_live_tup as live_rows,
            n_dead_tup as dead_rows,
            CASE 
                WHEN n_live_tup > 0 THEN round(100.0 * n_dead_tup / n_live_tup, 1)
                ELSE 0 
            END as bloat_percent
        FROM pg_stat_user_tables 
        WHERE n_live_tup > 1000 AND n_dead_tup > n_live_tup * 0.1
        ORDER BY bloat_percent DESC
        LIMIT 3;
    " 2>/dev/null || true)
    
    if [ -n "$bloat_check" ]; then
        echo -e "${YELLOW}Tables with significant bloat:${NC}"
        echo "$bloat_check" | while IFS='|' read -r table live dead percent; do
            [ -n "$table" ] && echo "  $table: $percent% bloat ($dead dead / $live live)"
        done
    fi
}

check_system_resources() {
    log "Checking system resources..."
    
    # Memory usage
    local mem_info
    mem_info=$(free | grep '^Mem:' | awk '{printf "%.1f|%s|%s", $3/$2 * 100.0, $3, $2}')
    IFS='|' read -r mem_percent mem_used mem_total <<< "$mem_info"
    
    if (( $(echo "$mem_percent > $MEMORY_THRESHOLD_PERCENT" | bc -l) )); then
        echo -e "${RED}HIGH MEMORY: ${mem_percent}% ($(($mem_used/1024))MB/$(($mem_total/1024))MB)${NC}"
    else
        echo -e "${GREEN}Memory OK: ${mem_percent}% ($(($mem_used/1024))MB/$(($mem_total/1024))MB)${NC}"
    fi
    
    # CPU load average
    local cpu_load
    cpu_load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    
    if (( $(echo "$cpu_load > $CPU_THRESHOLD" | bc -l) )); then
        echo -e "${RED}HIGH CPU LOAD: $cpu_load${NC}"
    else
        echo -e "${GREEN}CPU load OK: $cpu_load${NC}"
    fi
    
    # Disk I/O
    if command -v iostat >/dev/null 2>&1; then
        local disk_io
        disk_io=$(iostat -x 1 1 | grep -E '^[a-z]+' | awk 'NR==1{print $10}' 2>/dev/null || echo "0")
        echo -e "${BLUE}Disk I/O wait: ${disk_io}%${NC}"
    fi
}

check_application_health() {
    log "Checking application processes..."
    
    local backend_pid
    backend_pid=$(pgrep -f "research_workbench.*4512" || echo "")
    if [ -n "$backend_pid" ]; then
        echo -e "${GREEN}Backend running (PID: $backend_pid)${NC}"
        
        # Check backend memory usage
        local backend_mem
        backend_mem=$(ps -o pid,rss,vsz -p "$backend_pid" | tail -1 | awk '{printf "RSS: %dMB, VSZ: %dMB", $2/1024, $3/1024}')
        echo -e "${BLUE}Backend memory: $backend_mem${NC}"
    else
        echo -e "${RED}Backend not running${NC}"
    fi
    
    local frontend_pid
    frontend_pid=$(pgrep -f "vite.*4511" || echo "")
    if [ -n "$frontend_pid" ]; then
        echo -e "${GREEN}Frontend dev server running (PID: $frontend_pid)${NC}"
    else
        echo -e "${YELLOW}Frontend dev server not running${NC}"
    fi
    
    local nginx_pid
    nginx_pid=$(pgrep nginx | head -1 || echo "")
    if [ -n "$nginx_pid" ]; then
        echo -e "${GREEN}Nginx running (PID: $nginx_pid)${NC}"
    else
        echo -e "${RED}Nginx not running${NC}"
    fi
}

generate_performance_summary() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo -e "\n${BLUE}=== Performance Summary $timestamp ===${NC}"
    
    check_api_performance || true
    echo
    
    check_database_performance || true
    echo
    
    check_system_resources
    echo
    
    check_application_health
    echo
    
    # Save metrics to file
    if [ -f "$METRICS_FILE" ]; then
        local current_metrics
        current_metrics=$(cat "$METRICS_FILE")
        echo "$current_metrics" | jq ". + {\"timestamp\": \"$timestamp\", \"memory_percent\": $mem_percent, \"cpu_load\": $cpu_load}" > "$METRICS_FILE.tmp" && mv "$METRICS_FILE.tmp" "$METRICS_FILE"
    fi
    
    echo -e "${BLUE}=== End Performance Summary ===${NC}\n"
}

# Signal handling
trap 'log "Runtime performance monitor stopping"; exit 0' SIGTERM SIGINT

# Main execution
case "${1:-monitor}" in
    "once")
        generate_performance_summary
        ;;
    "monitor")
        log "Starting runtime performance monitoring (interval: ${MONITOR_INTERVAL}s)..."
        log "Thresholds: API ${API_RESPONSE_THRESHOLD_MS}ms, DB ${DB_QUERY_THRESHOLD_MS}ms, Memory ${MEMORY_THRESHOLD_PERCENT}%, CPU ${CPU_THRESHOLD}"
        
        while true; do
            generate_performance_summary
            sleep "$MONITOR_INTERVAL"
        done
        ;;
    "api")
        check_api_performance
        ;;
    "db")
        check_database_performance
        ;;
    "system")
        check_system_resources
        ;;
    "health")
        check_application_health
        ;;
    *)
        echo "Usage: $0 {once|monitor|api|db|system|health}"
        echo "  once    - Run performance check once"
        echo "  monitor - Continuous monitoring (default)"
        echo "  api     - API performance only"
        echo "  db      - Database performance only"
        echo "  system  - System resources only"
        echo "  health  - Application health only"
        exit 1
        ;;
esac