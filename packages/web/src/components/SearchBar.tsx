interface Props {
  value: string;
  onChange: (next: string) => void;
}

export function SearchBar({ value, onChange }: Props) {
  return (
    <label className="block">
      <span className="sr-only">search</span>
      <input
        aria-label="search"
        type="search"
        placeholder="Search title, url, tag, notes…"
        className="w-full px-3 py-2 bg-mist border border-fog rounded text-cyan-soft focus:border-cyan focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
