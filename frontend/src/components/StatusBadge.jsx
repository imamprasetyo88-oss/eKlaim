import { STATUS_LABEL } from "@/lib/api";

export default function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status}`} data-testid={`status-${status}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}
