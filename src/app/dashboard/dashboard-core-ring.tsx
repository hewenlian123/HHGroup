import { cn } from "@/lib/utils";

type CoreNode = {
  label: string;
  value: string;
  tone: "copper" | "emerald" | "steel" | "alert";
};

const nodePositions = [
  "left-[50%] top-[7%] -translate-x-1/2",
  "right-[6%] top-[27%]",
  "right-[10%] bottom-[16%]",
  "left-[9%] bottom-[16%]",
  "left-[5%] top-[28%]",
];

const orbitalTickAngles = Array.from({ length: 72 }, (_, index) => index * 5);

export function DashboardCoreRing({
  label,
  value,
  status,
  helper,
  tone,
  nodes,
}: {
  label: string;
  value: string;
  status: string;
  helper: string;
  tone: "positive" | "pressure" | "review";
  nodes: CoreNode[];
}) {
  return (
    <section
      className="dashboard-core-ring relative mx-auto aspect-square w-full max-w-[29rem] min-w-0"
      aria-label={label}
    >
      <svg
        className="hh-orbital-precision-dial"
        viewBox="0 0 200 200"
        aria-hidden="true"
        focusable="false"
      >
        <circle className="hh-orbital-svg__glass-plate" cx="100" cy="100" r="72" />
        <circle className="hh-orbital-svg__outer-hairline" cx="100" cy="100" r="84" />
        <circle className="hh-orbital-svg__middle-hairline" cx="100" cy="100" r="68" />
        <circle className="hh-orbital-svg__inner-hairline" cx="100" cy="100" r="52" />
        <circle className="hh-orbital-svg__core-boundary" cx="100" cy="100" r="34" />
        <circle
          className="hh-orbital-svg__outer-segment-ring"
          cx="100"
          cy="100"
          r="78"
          pathLength="100"
          strokeDasharray="1.2 5.05"
          strokeDashoffset="0.5"
        />
        <circle
          className="hh-orbital-svg__inner-segment-ring"
          cx="100"
          cy="100"
          r="58"
          pathLength="100"
          strokeDasharray="0.9 6.4"
          strokeDashoffset="2"
        />

        <g className="hh-orbital-svg__microticks hh-orbital-svg__spin-microticks">
          {orbitalTickAngles.map((angle, index) => (
            <line
              key={angle}
              className={cn("hh-orbital-svg__tick", {
                "hh-orbital-svg__tick--major": index % 6 === 0,
              })}
              x1="100"
              y1="11.8"
              x2="100"
              y2={index % 6 === 0 ? "18.4" : "15.4"}
              transform={`rotate(${angle} 100 100)`}
            />
          ))}
        </g>

        <g className="hh-orbital-svg__spin-amber">
          <circle
            className="hh-orbital-svg__amber-arc"
            cx="100"
            cy="100"
            r="84"
            pathLength="100"
            strokeDasharray="18 6 9 67"
            strokeDashoffset="6"
          />
        </g>

        <g className="hh-orbital-svg__spin-emerald">
          <circle
            className="hh-orbital-svg__emerald-arc"
            cx="100"
            cy="100"
            r="68"
            pathLength="100"
            strokeDasharray="16 8 8 68"
            strokeDashoffset="34"
          />
        </g>

        <g className="hh-orbital-svg__spin-stone">
          <circle
            className="hh-orbital-svg__stone-arc"
            cx="100"
            cy="100"
            r="52"
            pathLength="100"
            strokeDasharray="20 10 11 59"
            strokeDashoffset="58"
          />
        </g>

        <g className="hh-orbital-svg__spin-sweep">
          <circle
            className="hh-orbital-svg__highlight-sweep"
            cx="100"
            cy="100"
            r="78"
            pathLength="100"
            strokeDasharray="13 87"
            strokeDashoffset="18"
          />
        </g>
      </svg>

      {nodes.slice(0, 5).map((node, index) => (
        <div
          key={node.label}
          className={cn("dashboard-core-node absolute", nodePositions[index], {
            "dashboard-core-node--copper": node.tone === "copper",
            "dashboard-core-node--emerald": node.tone === "emerald",
            "dashboard-core-node--steel": node.tone === "steel",
            "dashboard-core-node--alert": node.tone === "alert",
          })}
          style={{ animationDelay: `${index * 180}ms` }}
        >
          <span className="dashboard-core-node__dot" aria-hidden />
          <span className="dashboard-core-node__text">
            {node.label}
            <span>{node.value}</span>
          </span>
        </div>
      ))}

      <div
        className={cn(
          "dashboard-profit-core absolute left-1/2 top-1/2 w-[min(94%,24rem)] -translate-x-1/2 -translate-y-1/2 px-2 text-center",
          {
            "dashboard-profit-core--positive": tone === "positive",
            "dashboard-profit-core--pressure": tone === "pressure",
            "dashboard-profit-core--review": tone === "review",
          }
        )}
      >
        <p className="dashboard-profit-core__label">{label}</p>
        <p className="dashboard-profit-core__value" title={value}>
          {value}
        </p>
        <div className="dashboard-profit-core__pulse" aria-hidden />
        <p className="dashboard-profit-core__status">
          <span aria-hidden />
          {status}
        </p>
        <p className="dashboard-profit-core__helper">{helper}</p>
      </div>
    </section>
  );
}
