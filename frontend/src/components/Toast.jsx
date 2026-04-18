import { useState, useCallback, useEffect } from "react";

let _show = null;

export function useToast() {
  const show = useCallback((msg, type = "success") => {
    if (_show) _show(msg, type);
  }, []);
  return { toast: show };
}

export default function Toast() {
  const [item, setItem] = useState(null);

  useEffect(() => {
    _show = (msg, type) => {
      setItem({ msg, type, id: Date.now() });
      setTimeout(() => setItem(null), 3200);
    };
    return () => { _show = null; };
  }, []);

  if (!item) return null;

  return (
    <div key={item.id} className={`toast ${item.type}`}>
      {item.type === "success" ? "✓" : "✕"} {item.msg}
    </div>
  );
}
