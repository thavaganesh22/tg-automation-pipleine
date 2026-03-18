import { useEffect } from 'react';

interface Props {
  name:      string;
  onConfirm: () => void;
  onCancel:  () => void;
  loading?:  boolean;
}

export function ConfirmDialog({ name, onConfirm, onCancel, loading }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel, loading]);

  return (
    <div data-testid="modal-overlay" className="modal-overlay" onClick={onCancel}>
      <div data-testid="confirm-dialog" className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Delete employee?</h3>
        <p>
          This will permanently remove <strong>{name}</strong> from the
          directory. This action cannot be undone.
        </p>
        <div className="modal-actions">
          <button data-testid="confirm-cancel-btn" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button data-testid="confirm-delete-btn" className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
