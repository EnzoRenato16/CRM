import type { CardSpec } from "@/lib/cards/schema";
import { KpiCard } from "./KpiCard";
import { PieCard } from "./PieCard";
import { BarCard } from "./BarCard";
import { LineCard } from "./LineCard";
import { TableCard } from "./TableCard";
import { TextCard } from "./TextCard";

/**
 * The generative-UI dispatcher: turns a validated CardSpec into a whitelisted
 * React component. There is no code path from model output to execution — only
 * to these fixed components.
 */
export function CardRenderer({ card }: { card: CardSpec }) {
  switch (card.type) {
    case "kpi":
      return <KpiCard spec={card} />;
    case "pie":
      return <PieCard spec={card} />;
    case "bar":
      return <BarCard spec={card} />;
    case "line":
      return <LineCard spec={card} />;
    case "table":
      return <TableCard spec={card} />;
    case "text":
      return <TextCard spec={card} />;
    default:
      // Exhaustiveness: adding a card variant without a renderer is a compile
      // error here (card is narrowed to `never`) instead of a silent blank.
      return assertNeverCard(card);
  }
}

function assertNeverCard(card: never): null {
  void card;
  return null;
}

export function CardGrid({ cards }: { cards: CardSpec[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <CardRenderer key={i} card={card} />
      ))}
    </div>
  );
}
