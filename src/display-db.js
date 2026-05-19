export async function saveDisplayRecord(record) {
  const response = await fetch("/api/displays", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    throw new Error(`Failed to save display: ${response.status}`);
  }

  return response.json();
}

export async function getDisplayRecord(id) {
  if (!id) return null;

  const response = await fetch(`/api/displays/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`Failed to load display: ${response.status}`);
  }

  return response.json();
}
