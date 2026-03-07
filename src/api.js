const API = "/api/db";

export async function fetchAll() {
  const res = await fetch(`${API}?action=getAll`);
  if (!res.ok) throw new Error("讀取失敗");
  return res.json();
}

export async function saveData(key, value) {
  const res = await fetch(`${API}?action=set`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error("儲存失敗");
  return res.json();
}
