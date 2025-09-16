use crate::services::session::{SessionData, SessionManager};
use async_trait::async_trait;
use chrono::Utc;
use std::collections::HashMap;
use tower_sessions::{session::Record, session_store, SessionStore};
use uuid::Uuid;

/// Custom Redis-backed session store with PostgreSQL fallback
/// Integrates with tower-sessions while providing persistent storage
#[derive(Clone, Debug)]
pub struct PersistentSessionStore {
    session_manager: SessionManager,
}

impl PersistentSessionStore {
    pub fn new(session_manager: SessionManager) -> Self {
        Self { session_manager }
    }
}

#[async_trait]
impl SessionStore for PersistentSessionStore {
    async fn save(&self, record: &Record) -> session_store::Result<()> {
        let session_id = record.id.to_string();

        // Extract user_id from session data if available
        let user_id = record
            .data
            .get("user_id")
            .and_then(|v| v.as_str())
            .and_then(|s| Uuid::parse_str(s).ok())
            .unwrap_or_else(|| Uuid::new_v4()); // Fallback for anonymous sessions

        let session_data = SessionData {
            user_id,
            created_at: Utc::now(),
            last_accessed: Utc::now(),
            ip_address: record
                .data
                .get("ip_address")
                .and_then(|v| v.as_str())
                .map(|s| s.into()),
            user_agent: record
                .data
                .get("user_agent")
                .and_then(|v| v.as_str())
                .map(|s| s.into()),
        };

        self.session_manager
            .store_session(&session_id, session_data)
            .await
            .map_err(|e| {
                session_store::Error::Backend(format!("Failed to store session: {}", e))
            })?;

        Ok(())
    }

    async fn load(
        &self,
        session_id: &tower_sessions::session::Id,
    ) -> session_store::Result<Option<Record>> {
        let session_id_str = session_id.to_string();

        match self.session_manager.get_session(&session_id_str).await {
            Ok(Some(_session_data)) => {
                // For tower-sessions compatibility, we need to return a Record
                // The actual session data is managed by the SessionManager
                // This just tells tower-sessions that the session exists
                let mut data = HashMap::new();
                data.insert("exists".to_string(), serde_json::Value::Bool(true));

                Ok(Some(Record {
                    id: *session_id,
                    data,
                    expiry_date: time::OffsetDateTime::now_utc() + time::Duration::hours(24),
                }))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(session_store::Error::Backend(format!(
                "Failed to load session: {}",
                e
            ))),
        }
    }

    async fn delete(&self, session_id: &tower_sessions::session::Id) -> session_store::Result<()> {
        let session_id_str = session_id.to_string();

        self.session_manager
            .delete_session(&session_id_str)
            .await
            .map_err(|e| {
                session_store::Error::Backend(format!("Failed to delete session: {}", e))
            })?;

        Ok(())
    }
}
