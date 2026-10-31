import { useState } from 'react';

import { Modal } from '@/shared/ui/Modal';
import { useUi } from '@/shared/model/ui';

/** Asks for the password of a data source that does not keep it in the keychain. */
export function PasswordPrompt() {
  const request = useUi((s) => s.passwordRequest);
  const answer = useUi((s) => s.answerPassword);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);

  if (!request) return null;
  const submit = () => {
    answer({ password, remember });
    setPassword('');
  };
  const cancel = () => {
    answer(null);
    setPassword('');
  };

  return (
    <Modal
      title={`Connect to ${request.connection.name}`}
      width={400}
      onClose={cancel}
      footer={
        <>
          <span className="footer-left" />
          <button type="button" className="btn" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={submit}>
            Connect
          </button>
        </>
      }
    >
      <form
        className="password-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span>User</span>
          <input value={request.connection.user} disabled />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Save in Keychain
        </label>
      </form>
    </Modal>
  );
}
