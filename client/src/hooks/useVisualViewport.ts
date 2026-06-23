import { useEffect, useState } from "react";

/** Height obscured by the on-screen keyboard (0 when keyboard is hidden). */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const obscured = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(Math.max(0, Math.round(obscured)));
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return inset;
}
