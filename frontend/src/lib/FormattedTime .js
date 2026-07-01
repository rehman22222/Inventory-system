import React from 'react';
import { format } from 'date-fns';

const FormattedTime = ({ timestamp }) => {
  if (!timestamp) return null;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  // Show both date and time, e.g. "Jul 01, 2026 • 07:45 AM"
  const formatted = format(date, 'MMM dd, yyyy • hh:mm a');

  return <span>{formatted}</span>;
};

export default FormattedTime;
