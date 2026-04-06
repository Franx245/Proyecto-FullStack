import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const getIsMobile = () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(getIsMobile());

/** @param {{matches: boolean}} e */
    const handleChange = (e) => {
      setIsMobile(e.matches);
    };

    // soporte moderno + fallback
    if (mql.addEventListener) {
      mql.addEventListener("change", handleChange);
    } else {
      mql.addListener(handleChange);
    }

    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener("change", handleChange);
      } else {
        mql.removeListener(handleChange);
      }
    };
  }, []);

  return isMobile;
}