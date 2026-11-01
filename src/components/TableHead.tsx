export interface TableColumn {
  label: string;
  align?: "right";
  key?: string;
}

/** Shared header so table markup stays consistent and is not duplicated per page. */
export default function TableHead({ columns }: { columns: TableColumn[] }) {
  return (
    <thead>
      <tr>
        {columns.map((column) => (
          <th key={column.key ?? column.label} className={column.align === "right" ? "right" : undefined}>
            {column.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}
