export default function AppLoading() {
  return (
    <div className="mx-auto max-w-[1500px] animate-pulse px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <div className="h-3 w-32 rounded bg-white/5" />
      <div className="mt-4 h-8 w-72 max-w-full rounded bg-white/10" />
      <div className="mt-3 h-4 w-96 max-w-full rounded bg-white/5" />
      <div className="mt-8 flex flex-wrap gap-2">
        {[88, 110, 96, 126, 104, 118].map((width, index) => (
          <div key={index} className="h-9 rounded-lg bg-white/5" style={{ width }} />
        ))}
      </div>
      <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-32 rounded-xl border border-white/5 bg-white/[0.025]" />
        ))}
      </div>
    </div>
  );
}
