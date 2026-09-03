import React from "react";
import { useTranslation } from "react-i18next";
import { FiMinus, FiPlus, FiTag, FiX } from "react-icons/fi";
import { currency } from "./posUtils";
import maskIcon from "./maskIcon";
import emptyCartArt from "../../images/category-icons/empty-cart.png";

// Rate, qty and total are held to what their contents actually need — a price,
// three small controls, a price and a cross — so everything left over goes to
// the name. They used to reserve 306px between them, which left the product
// column about 120px on a narrow panel and broke names one word to a line.
const COLS = "grid-cols-[1fr_56px_84px_76px] sm:grid-cols-[1fr_64px_88px_84px]";

// The shop's own trolley, for a basket with nothing in it yet. Masked like the
// category marks, so it sits in the same muted grey as the line beneath it
// rather than glaring white out of an empty panel.
//
// Exported because the product grid shows the same mark when no aisle is open.
// One trolley in one place: two copies of this would eventually be two
// different trolleys.
export const EmptyCart = maskIcon(emptyCartArt, "emptyCart");

// The middle sale panel: the running list of lines on this transaction.
function SaleTable({
  cart,
  selectedId,
  deals = [],
  onSelect,
  onQuantityChange,
  onRemove,
}) {
  const { t } = useTranslation();

  // Split the basket into what each offer covers and what is left at shelf
  // price. A unit belongs to the first deal that claims it — deals do not share
  // units, and if two ever did, showing the same item inside two boxes would be
  // worse than picking one.
  const remaining = new Map(cart.map((item) => [String(item.productId), item.quantity]));

  const groups = deals
    .map((deal) => {
      const rows = [];
      // Basket order, not the order the allocation happens to be keyed in, so
      // the box reads in the order the cashier rang things up.
      cart.forEach((item) => {
        const id = String(item.productId);
        const wanted = Number(deal.allocation?.[id] || 0);
        const left = remaining.get(id) || 0;
        const take = Math.min(wanted, left);
        if (take <= 0) return;
        remaining.set(id, left - take);
        rows.push({ ...item, quantity: take, line: item.quantity, part: String(deal.dealId) });
      });
      return { dealId: deal.dealId, name: deal.name, sets: deal.sets, rows };
    })
    .filter((group) => group.rows.length > 0);

  const loose = cart
    .map((item) => ({
      ...item,
      quantity: remaining.get(String(item.productId)) || 0,
      line: item.quantity,
      part: "loose",
    }))
    .filter((item) => item.quantity > 0);

  const renderRow = (item) => {
    const active = selectedId === item.productId;

    return (
      <div
        key={`${item.productId}-${item.part}`}
        onClick={() => onSelect(item.productId)}
        className={`grid ${COLS} cursor-pointer items-center gap-1.5 border-b border-slate-900 px-3 py-2.5 text-sm transition ${
          active
            ? "bg-cyan-950/50 shadow-[inset_3px_0_0_0_theme(colors.cyan.500)]"
            : "hover:bg-slate-900/60"
        }`}
      >
        {/* The whole name, wrapped rather than cut off. A cashier checking a
            basket against what is on the counter reads the flavour and the
            strength — "Mentos M…" identifies nothing, and this catalogue puts
            what distinguishes two lines at the END of the name. */}
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-snug text-slate-100">
            <span className="break-words">{item.name}</span>
          </p>
        </div>

        <span className="text-end font-mono tabular-nums text-slate-400">{currency(item.price)}</span>

        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              // Always the whole line: splitting one across a deal box and the
              // loose rows is a way of showing the basket, not of splitting
              // what the customer is buying.
              onQuantityChange(item.productId, item.line - 1);
            }}
            className="bg-slate-800 p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100 active:scale-90"
            aria-label={t("pos.table.decrease")}
          >
            <FiMinus className="h-3 w-3" />
          </button>
          <span className="pos-plain-num w-7 text-center font-mono font-semibold tabular-nums text-slate-100">
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onQuantityChange(item.productId, item.line + 1);
            }}
            className="bg-slate-800 p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100 active:scale-90"
            aria-label={t("pos.table.increase")}
          >
            <FiPlus className="h-3 w-3" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-0.5">
          {/* The same cyan the product tiles price in. What a line comes to is
              the figure the customer is watching, and it should read as the
              same kind of number they just tapped on the grid — not as another
              piece of the row's furniture. The unit price beside it stays grey:
              two cyan columns and neither one leads. */}
          <span className="font-mono font-semibold tabular-nums text-cyan-400">
            {currency(item.price * item.quantity)}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(item.productId);
            }}
            className="p-1 text-slate-700 transition hover:bg-red-950 hover:text-red-400"
            aria-label={t("pos.table.remove")}
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-950">
      <div
        className={`grid ${COLS} gap-1.5 border-b border-slate-800 bg-slate-900/80 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500`}
      >
        <span>{t("pos.table.product")}</span>
        <span className="text-end">{t("pos.table.rate")}</span>
        <span className="text-center">{t("pos.table.qty")}</span>
        <span className="text-end">{t("pos.table.total")}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          /* The trolley on its own. "Scan barcode or select products" was
             telling a cashier the two things they were already about to do,
             every time the basket was empty — which is most of the day. The
             mark says empty; nothing else needs saying. */
          <div className="flex h-full items-center justify-center text-slate-800">
            <EmptyCart className="h-28 w-28" />
          </div>
        ) : (
          <>
            {/* Each offer's own products, boxed together. A deal is a group —
                "these three for €18" — so the basket shows it as one, with the
                line ruled around all of them rather than a mark on each. */}
            {groups.map((group) => (
              <div
                key={String(group.dealId)}
                className="m-1.5 border-2 border-fuchsia-700 bg-fuchsia-950/20"
              >
                <div className="flex min-w-0 items-center gap-1.5 border-b border-fuchsia-900/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-fuchsia-300">
                  <FiTag className="h-2.5 w-2.5" />
                  <span className="min-w-0 flex-1 truncate">{group.name}</span>
                  {group.sets > 1 && (
                    <span className="shrink-0 rounded-sm bg-fuchsia-600 px-1.5 py-0.5 font-mono text-[10px] leading-none text-white ring-1 ring-fuchsia-400/50">
                      x{group.sets}
                    </span>
                  )}
                </div>
                {group.rows.map((row) => renderRow(row))}
              </div>
            ))}

            {/* Everything at shelf price, including the units of a product whose
                others are in a set above — scanning a fourth of something with
                three in a 3-for offer puts that fourth here, where the cashier
                can see it is being charged in full. */}
            {loose.map((row) => renderRow(row))}
          </>
        )}
      </div>
    </div>
  );
}

export default SaleTable;
