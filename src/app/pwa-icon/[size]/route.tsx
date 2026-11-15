import { ImageResponse } from "next/og";

const SIZES = [180, 192, 512];

export function generateStaticParams() {
  return SIZES.map((s) => ({ size: String(s) }));
}

export async function GET(_: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size: raw } = await ctx.params;
  const size = SIZES.includes(Number(raw)) ? Number(raw) : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111111",
          color: "#ffffff",
          fontSize: size * 0.36,
          fontWeight: 800,
          letterSpacing: -size * 0.01,
        }}
      >
        k<span style={{ color: "#ffd21f" }}>.</span>
      </div>
    ),
    { width: size, height: size },
  );
}
