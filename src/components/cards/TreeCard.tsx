import type { TreeCard as TreeCardSpec, TreeNode } from "@/lib/cards/schema";
import { CardShell } from "./CardShell";

const TONE: Record<NonNullable<TreeNode["tone"]>, string> = {
  total: "bg-ink-900 text-white dark:bg-ink-800",
  positive: "bg-brand-600 text-white",
  negative: "bg-rose-500 text-white",
  neutral:
    "bg-brand-50 text-brand-800 border border-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:border-brand-500/30",
};

function NodeBox({ node }: { node: TreeNode }) {
  return (
    <div className={`w-[150px] rounded-lg px-3 py-2 text-center shadow-sm ${TONE[node.tone ?? "neutral"]}`}>
      <div className="text-[11px] font-medium opacity-90">{node.label}</div>
      <div className="mt-0.5 text-base font-bold leading-tight tabular-nums">{node.value}</div>
      {node.hint && <div className="mt-0.5 text-[10px] leading-tight opacity-70">{node.hint}</div>}
    </div>
  );
}

function TreeNodeView({ node }: { node: TreeNode }) {
  const children = node.children ?? [];
  return (
    <div className="flex flex-col items-center">
      <NodeBox node={node} />
      {children.length > 0 && (
        <>
          <span className="h-4 w-px bg-ink-300 dark:bg-ink-700" aria-hidden="true" />
          <div className="flex items-start gap-6">
            {children.map((child, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className="h-4 w-px bg-ink-300 dark:bg-ink-700" aria-hidden="true" />
                <TreeNodeView node={child} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TreeCard({ spec }: { spec: TreeCardSpec }) {
  return (
    <CardShell title={spec.title} caption={spec.caption} className="col-span-full">
      <div className="mt-4 overflow-x-auto">
        <div className="flex min-w-max justify-center px-2 pb-2">
          <TreeNodeView node={spec.root} />
        </div>
      </div>
    </CardShell>
  );
}
