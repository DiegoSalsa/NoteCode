import {
  projectPriceView,
  type ProjectPriceInput,
} from "@/lib/commercial/price-view";
import { formatMoney } from "@/lib/commercial/money";

export default function ProjectPrice({
  project,
}: {
  project: ProjectPriceInput;
}) {
  const price = projectPriceView(project);
  return (
    <div data-testid="project-price" className="mt-1 text-xs text-neutral-400">
      <p>{price.label}</p>
      {price.net !== null && price.tax !== null && (
        <p className="mt-0.5">
          Neto {formatMoney(price.net, price.currency)} · IVA{" "}
          {formatMoney(price.tax, price.currency)}
        </p>
      )}
      {price.total !== null && (
        <p className="mt-0.5">
          Total {formatMoney(price.total, price.currency)}
        </p>
      )}
    </div>
  );
}
