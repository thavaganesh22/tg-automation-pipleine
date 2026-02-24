interface Props {
  firstName: string;
  lastName:  string;
  size?:     "sm" | "lg";
}

export function Avatar({ firstName, lastName, size = "sm" }: Props) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  return (
    <div className="avatar" style={size === "lg" ? { width: 52, height: 52, fontSize: 18 } : {}}>
      {initials}
    </div>
  );
}
