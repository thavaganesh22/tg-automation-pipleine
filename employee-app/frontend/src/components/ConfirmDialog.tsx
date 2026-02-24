interface Props {
  name:      string;
  onConfirm: () => void;
  onCancel:  () => void;
  loading?:  boolean;
}

export function ConfirmDialog({ name, onConfirm, onCancel, loading }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Delete employee?</h3>
        <p>
          This will permanently remove <strong>{name}</strong> from the
          directory. This action cannot be undone.
        </p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
