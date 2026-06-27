import { useState, useEffect, useRef } from 'react';

// Shared in-game chat. Wired to the gateway via onSend (useGameSocket.sendChat);
// every multiplayer game gets chat for free.
export function Chat({ messages = [], onSend, disabled }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (t && !disabled) {
      onSend(t);
      setText('');
    }
  };
  return (
    <section aria-label="Chat" className="game-chat">
      <ul className="chat-messages" role="log" aria-live="polite">
        {messages.map((m, i) => (
          <li key={i}>
            <strong>{m.name}:</strong> {m.text}
          </li>
        ))}
        <li ref={bottomRef} aria-hidden="true" />
      </ul>
      <form onSubmit={submit} className="chat-form">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something…"
          maxLength={200}
          disabled={disabled}
          aria-label="Chat message"
        />
        <button className="btn btn-sm" type="submit" disabled={!text.trim() || disabled}>
          Send
        </button>
      </form>
    </section>
  );
}
