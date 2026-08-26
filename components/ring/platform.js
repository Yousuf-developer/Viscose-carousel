// iPadOS can identify itself as macOS, so the user agent alone is not enough.
// maxTouchPoints separates those iPads from actual Macs without changing the
// experience for touch-enabled Android or Windows devices.
export function isAppleTouchDevice(nav = navigator) {
  const mobileApple = /iPad|iPhone|iPod/.test(nav.userAgent ?? "");
  const desktopModeIPad =
    nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;

  return mobileApple || desktopModeIPad;
}
