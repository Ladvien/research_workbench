import React from 'react';
import AnalyticsDashboard from '../../components/AnalyticsDashboard';

/**
 * Dashboard page component - provides analytics and user insights
 * Uses the AnalyticsDashboard component for the actual analytics functionality
 */
export const Dashboard: React.FC = () => {
  return (
    <div className="h-full overflow-y-auto">
      <AnalyticsDashboard />
    </div>
  );
};

export default Dashboard;
