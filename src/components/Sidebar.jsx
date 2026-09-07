import './Sidebar.css'

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  open,
  newLabel = 'Yeni Sohbet',
  emptyLabel = 'Henüz sohbet geçmişi yok',
  deleteLabel = 'Sohbeti sil',
}) {
  return (
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <button className="sidebar-new-btn" onClick={onNew}>
        <i className="bi bi-plus-lg"></i>
        {newLabel}
      </button>

      <div className="sidebar-list">
        {conversations.length === 0 && (
          <div className="sidebar-empty">{emptyLabel}</div>
        )}
        {conversations.map((c) => (
          <div key={c.id} className={`sidebar-item ${c.id === activeId ? 'sidebar-item-active' : ''}`}>
            <button className="sidebar-item-title" onClick={() => onSelect(c.id)}>
              {c.title}
            </button>
            <button
              className="sidebar-item-delete"
              aria-label={deleteLabel}
              onClick={() => onDelete(c.id)}
            >
              <i className="bi bi-trash"></i>
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}
