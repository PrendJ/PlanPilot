import { ImageResponse } from "next/og";

export const alt = "BoardCue — Parla, organizza, agisci · Speak, organize, act";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social card shared by every public page: brand mark, name and promise, in both interface languages. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#0D0F14",
          color: "#ECEEF4",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 64 64">
          <rect x="8" y="10" width="12" height="30" fill="#ECEEF4" />
          <rect x="26" y="10" width="12" height="44" fill="#ECEEF4" />
          <rect x="44" y="10" width="12" height="18" fill="#ECEEF4" />
          <circle cx="50" cy="41" r="6" fill="#FF7A4D" />
        </svg>
        <div style={{ display: "flex", fontSize: 112, fontWeight: 700, marginTop: 36, letterSpacing: -2 }}>BoardCue</div>
        <div style={{ display: "flex", fontSize: 46, marginTop: 12, color: "#FF7A4D" }}>Parla, organizza, agisci</div>
        <div style={{ display: "flex", fontSize: 32, marginTop: 28, color: "#A9AFC0" }}>Speak, organize, act · boardcue.draftapps.it</div>
      </div>
    ),
    size,
  );
}
