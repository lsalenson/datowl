import { useEffect, useRef, useState } from 'react';

import { useUi } from '../model/ui';
import { Modal } from './Modal';

/** The app's confirm / prompt dialog, opened through `useUi().ask`. */
export function AskDialog() {
  const request = useUi((s) => s.askRequest);
  return request ? <Ask key={request.title + (request.input?.value ?? '')} /> : null;
}

function Ask() {
  const request = useUi((s) => s.askRequest)!;
  const answer = useUi((s) => s.answerAsk);
  const [value, setValue] = useState(request.input?.value ?? '');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Pre-select the current value so typing replaces it.
    input.current?.select();
  }, []);

  const preview = typeof request.preview === 'function' ? request.preview(value) : request.preview;
  const valid = !request.input || value.trim() !== '';
  const submit = () => valid && answer(request.input ? value.trim() : '');

  return (
    <Modal
      title={request.title}
      width={460}
      onClose={() => answer(null)}
      footer={
        <>
          <span className="footer-left" />
          <button type="button" className="btn" onClick={() => answer(null)}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn primary${request.danger ? ' danger' : ''}`}
            disabled={!valid}
            onClick={submit}
            autoFocus={!request.input}
          >
            {request.confirmLabel ?? 'OK'}
          </button>
        </>
      }
    >
      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {request.message && <p className="ask-message">{request.message}</p>}
        {request.input && (
          <label className="field">
            <span>{request.input.label}</span>
            <input
              ref={input}
              value={value}
              placeholder={request.input.placeholder}
              onChange={(e) => setValue(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        )}
        {preview && <pre className="ask-preview">{preview}</pre>}
      </form>
    </Modal>
  );
}
