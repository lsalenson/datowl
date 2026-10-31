// The owl from the logo drawn as light pixels on transparent ground, for large marks
// on dark backgrounds (the logo itself is the owl cut out of an orchid tile).
export function OwlMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 9 10" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="currentColor" d="M0 0h1v1h-1zM8 0h1v1h-1zM0 1h2v1h-2zM7 1h2v1h-2zM0 2h9v1h-9zM0 3h1v1h-1zM3 3h3v1h-3zM8 3h1v1h-1zM0 4h1v1h-1zM3 4h1v1h-1zM5 4h1v1h-1zM8 4h1v1h-1zM0 5h9v1h-9zM0 6h1v1h-1zM2 6h5v1h-5zM8 6h1v1h-1zM0 7h1v1h-1zM2 7h5v1h-5zM8 7h1v1h-1zM1 8h7v1h-7zM2 9h2v1h-2zM5 9h2v1h-2z" />
      <path fill="#ff5440" d="M4 4h1v1h-1z" />
    </svg>
  );
}
