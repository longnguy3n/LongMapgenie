// Readable profile row shared by the standalone and embedded popup.
export function createProfileRow({ React, jsx, Icon, classes, useDispatch, activate, rename }) {
  return function ProfileRow({ profile, disabled }) {
    const dispatch = useDispatch();
    const [editing, setEditing] = React.useState(false);
    const [name, setName] = React.useState(profile.name);
    const [original, setOriginal] = React.useState(profile.name);
    const [error, setError] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    async function save(event) {
      event.preventDefault();
      if (saving || disabled) return;
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 80) { setError('Nhập tên profile từ 1 đến 80 ký tự.'); return; }
      setSaving(true); setError('');
      try {
        await dispatch(rename({ id: profile.id, name: trimmed, expectedName: original })).unwrap();
        setEditing(false);
      } catch (error) { setError(typeof error === 'string' ? error : error.message || 'Không đổi được tên profile.'); }
      finally { setSaving(false); }
    }
    return jsx.jsxs('div', { className: 'lmg-profile-row', children: [
      jsx.jsxs('div', { className: 'lmg-profile-actions', children: [
        jsx.jsxs('button', { type: 'button', disabled: disabled || saving, className: classes.row + (profile.active ? ' ' + classes.active : ''), 'aria-pressed': profile.active, onClick: () => dispatch(activate(profile.id)), children: [jsx.jsx(Icon, { className: classes.avatar, icon: 'user' }), jsx.jsx('span', { children: profile.name })] }),
        jsx.jsx('button', { type: 'button', className: 'lmg-profile-rename', disabled: disabled || saving, 'aria-label': 'Đổi tên ' + profile.name, onClick: () => { setName(profile.name); setOriginal(profile.name); setError(''); setEditing(true); }, children: 'Đổi tên' })
      ] }),
      editing && jsx.jsxs('form', { className: 'lmg-profile-editor', onSubmit: save, children: [
        jsx.jsx('input', { autoFocus: true, 'aria-label': 'Tên profile', value: name, maxLength: 80, disabled: saving, onChange: event => setName(event.target.value), onKeyDown: event => { if (event.key === 'Escape' && !saving) { event.preventDefault(); setEditing(false); } } }),
        jsx.jsx('button', { type: 'submit', disabled: disabled || saving, children: saving ? 'Đang lưu…' : 'Lưu' }),
        jsx.jsx('button', { type: 'button', disabled: saving, onClick: () => setEditing(false), children: 'Hủy' }),
        error && jsx.jsx('p', { role: 'alert', children: error })
      ] })
    ] });
  };
}
