import { useState } from "react";
import { UserCircle2 } from "lucide-react";

/** @param {string} [name] */
function getAvatarInitial(name) {
  const value = String(name || "U").trim();
  return value ? value.charAt(0).toUpperCase() : "U";
}

/** @param {{ src?: string, alt?: string, name?: string, className?: string, fallbackClassName?: string, iconClassName?: string }} props */
export default function UserAvatar({ src, alt, name, className = "", fallbackClassName = "", iconClassName = "" }) {
  const [hasError, setHasError] = useState(false);
  const showImage = Boolean(src) && !hasError;

  if (showImage) {
    return <img src={src} alt={alt || name || "Usuario"} className={className} onError={() => setHasError(true)} />;
  }

  if (fallbackClassName) {
    return <div className={fallbackClassName}>{getAvatarInitial(name)}</div>;
  }

  return <UserCircle2 className={iconClassName || className} aria-hidden="true" />;
}