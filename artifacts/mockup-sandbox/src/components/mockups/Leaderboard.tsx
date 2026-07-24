export default function Leaderboard() {
  const students = [
    { rank: 1,  username: "StarQueen",   emoji: "👑", color: "#7c3aed", points: 4820 },
    { rank: 2,  username: "PhoenixBoy",  emoji: "🦅", color: "#6366f1", points: 4315 },
    { rank: 3,  username: "LunaGirl",    emoji: "🌙", color: "#a855f7", points: 3990 },
    { rank: 4,  username: "TigerMike",   emoji: "🐯", color: "#8b5cf6", points: 3740 },
    { rank: 5,  username: "RocketKid",   emoji: "🚀", color: "#6d28d9", points: 3510 },
    { rank: 6,  username: "OwlWizard",   emoji: "🦉", color: "#7c3aed", points: 3280 },
    { rank: 7,  username: "CosmosAlex",  emoji: "🌌", color: "#4f46e5", points: 3050 },
    { rank: 8,  username: "DiamondSam",  emoji: "💎", color: "#9333ea", points: 2870 },
    { rank: 9,  username: "WolfDan",     emoji: "🐺", color: "#7c3aed", points: 2640 },
    { rank: 10, username: "SunRiser",    emoji: "☀️", color: "#6366f1", points: 2410 },
    { rank: 11, username: "ArrowKate",   emoji: "🏹", color: "#a855f7", points: 2190 },
    { rank: 12, username: "IceBreaker",  emoji: "🧊", color: "#6d28d9", points: 1980 },
    { rank: 13, username: "MapleLeaf",   emoji: "🍁", color: "#8b5cf6", points: 1760 },
    { rank: 14, username: "NightOwl",    emoji: "🌃", color: "#7c3aed", points: 1530 },
    { rank: 15, username: "SparkPlug",   emoji: "⚡", color: "#4f46e5", points: 1310 },
  ];

  const top3 = students.slice(0, 3);
  const rest  = students.slice(3);

  const podiumOrder = [top3[1], top3[0], top3[2]]; // 2nd | 1st | 3rd
  const podiumRanks = [2, 1, 3];

  const metalColors = [
    { border: "#d4af37", glow: "#f3cf6a", badge: "linear-gradient(135deg,#fff6d0,#f3cf6a,#c9971f)" },
    { border: "#b0b8bf", glow: "#d8dce1", badge: "linear-gradient(135deg,#fbfbfc,#d8dce1,#a3aab3)" },
    { border: "#c17a3e", glow: "#c9803f", badge: "linear-gradient(135deg,#f0c497,#c9803f,#9a5a24)" },
  ];

  return (
    <div style={{
      width: 402,
      minHeight: 874,
      background: "#f5f3ff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflowX: "hidden",
    }}>

      {/* ── Hero gradient ── */}
      <div style={{
        background: "linear-gradient(180deg,#2e1065 0%,#5b21b6 55%,#7c3aed 100%)",
        paddingTop: 56,
        paddingBottom: 0,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* subtle noise overlay */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          pointerEvents: "none",
        }} />

        {/* Title */}
        <div style={{ padding: "0 20px 16px" }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>Рейтинг</div>
        </div>

        {/* Scope tabs */}
        <div style={{
          margin: "0 20px 12px",
          background: "rgba(255,255,255,0.12)",
          borderRadius: 24, padding: 4,
          display: "flex",
        }}>
          {["Все ученики", "Друзья"].map((label, i) => (
            <div key={label} style={{
              flex: 1, textAlign: "center", padding: "10px 0",
              borderRadius: 20,
              background: i === 0 ? "#fff" : "transparent",
              fontSize: 14, fontWeight: 700,
              color: i === 0 ? "#6d28d9" : "rgba(255,255,255,0.75)",
              cursor: "pointer",
            }}>{label}</div>
          ))}
        </div>

        {/* Category tabs */}
        <div style={{
          margin: "0 20px 24px",
          background: "rgba(255,255,255,0.12)",
          borderRadius: 24, padding: 4,
          display: "flex",
        }}>
          {[
            { label: "Очки",    icon: "★" },
            { label: "Время",   icon: "⏱" },
            { label: "Задания", icon: "✓" },
          ].map(({ label, icon }, i) => (
            <div key={label} style={{
              flex: 1, textAlign: "center", padding: "10px 0",
              borderRadius: 20,
              background: i === 0 ? "#fff" : "transparent",
              fontSize: 13, fontWeight: 700,
              color: i === 0 ? "#6d28d9" : "rgba(255,255,255,0.7)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              <span style={{ fontSize: 12 }}>{icon}</span>{label}
            </div>
          ))}
        </div>

        {/* Podium */}
        <div style={{
          display: "flex", alignItems: "flex-end",
          padding: "0 10px 32px",
          minHeight: 180,
        }}>
          {podiumOrder.map((student, i) => {
            const rank = podiumRanks[i];
            const isCenter = rank === 1;
            const metal = metalColors[rank - 1];
            const avatarSize = isCenter ? 88 : 72;

            return (
              <div key={student.rank} style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center",
                marginBottom: isCenter ? 0 : 18,
                marginTop: isCenter ? 0 : 18,
              }}>
                {/* Avatar with metallic ring */}
                <div style={{ position: "relative", marginBottom: 0 }}>
                  {/* Crown for rank 1 */}
                  {rank === 1 && (
                    <div style={{
                      position: "absolute", top: -26, left: "50%",
                      transform: "translateX(-50%)", zIndex: 5,
                      fontSize: 26,
                    }}>👑</div>
                  )}
                  <div style={{
                    width: avatarSize + 6, height: avatarSize + 6,
                    borderRadius: "50%",
                    background: metal.badge,
                    boxShadow: `0 0 22px 6px ${metal.glow}90`,
                    padding: 3,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{
                      width: avatarSize, height: avatarSize, borderRadius: "50%",
                      background: student.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: avatarSize * 0.44,
                      overflow: "hidden",
                    }}>
                      {student.emoji}
                    </div>
                  </div>
                  {/* Rank badge */}
                  <div style={{
                    position: "absolute", bottom: -12, left: "50%",
                    transform: "translateX(-50%)",
                    width: 28, height: 28, borderRadius: "50%",
                    background: metal.badge,
                    border: "2px solid #fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 900, color: "#fff",
                    textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    zIndex: 2,
                  }}>{rank}</div>
                </div>

                {/* Name + score */}
                <div style={{
                  marginTop: 20,
                  fontSize: isCenter ? 16 : 14,
                  fontWeight: 800, color: "#fff",
                  textAlign: "center", maxWidth: 110,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{student.username}</div>
                <div style={{
                  fontSize: 12, fontWeight: 600,
                  color: "rgba(255,255,255,0.7)", marginTop: 2,
                }}>{student.points} ⭐</div>
              </div>
            );
          })}
        </div>

        {/* Wave SVG */}
        <svg width="402" height="48" viewBox="0 0 402 48" preserveAspectRatio="none"
          style={{ display: "block", marginBottom: -1 }}>
          <path
            d="M0,20 C 120.6,48 249.24,-2 402,26 L 402,48 L 0,48 Z"
            fill="#f5f3ff"
          />
        </svg>
      </div>

      {/* ── Section label ── */}
      <div style={{
        padding: "12px 20px 6px",
        fontSize: 11, fontWeight: 700,
        color: "#5b4f8e", textTransform: "uppercase", letterSpacing: 0.6,
      }}>
        Участники · 15
      </div>

      {/* ── List ── */}
      <div style={{ padding: "0 0 32px" }}>
        {rest.map((s) => (
          <div key={s.rank} style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#fff",
            borderRadius: 14,
            padding: "12px 14px",
            margin: "0 20px 8px",
            border: "1px solid rgba(160,140,220,0.25)",
          }}>
            <div style={{
              width: 28, fontSize: 14, fontWeight: 800,
              textAlign: "center", color: "#5b4f8e",
            }}>{s.rank}</div>
            <div style={{
              width: 40, height: 40, borderRadius: 20,
              background: s.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20,
              flexShrink: 0,
            }}>{s.emoji}</div>
            <div style={{
              flex: 1, fontSize: 15, fontWeight: 600,
              color: "#0f172a", overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{s.username}</div>
            <div style={{
              fontSize: 15, fontWeight: 800, color: "#0f172a",
            }}>{s.points} ⭐</div>
          </div>
        ))}
      </div>
    </div>
  );
}
