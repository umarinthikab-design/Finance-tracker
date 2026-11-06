export function ReviewBadge({ count }: { count?: number }) {
  if (count === undefined) {
    return (
      <span className="ml-1.5 inline-block rounded bg-surface-container-high px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase text-on-surface-variant">
        review
      </span>
    );
  }
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-error px-1.5 py-0.5 align-middle text-[10px] font-semibold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}