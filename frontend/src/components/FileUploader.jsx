import { useRef, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { CloudArrowUp, Trash, FileText, Image as ImageIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function FileUploader({ files = [], onChange, testId = "file-uploader", multiple = true, accept = ".jpg,.jpeg,.png,.webp,.pdf" }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e) => {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;
    setBusy(true);
    const uploaded = [];
    for (const f of list) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const r = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        uploaded.push(r.data);
      } catch (err) {
        toast.error(`Upload ${f.name} gagal: ${err.response?.data?.detail || err.message}`);
      }
    }
    onChange([...files, ...uploaded]);
    setBusy(false);
    if (ref.current) ref.current.value = "";
  };

  const remove = (id) => onChange(files.filter((f) => f.id !== id));

  return (
    <div data-testid={testId}>
      <input ref={ref} type="file" accept={accept} multiple={multiple} onChange={handle} className="hidden" />
      <Button
        type="button"
        variant="outline"
        onClick={() => ref.current?.click()}
        disabled={busy}
        data-testid={`${testId}-btn`}
        className="w-full border-dashed border-2 py-6"
      >
        <CloudArrowUp size={20} className="mr-2 text-sky-600" weight="duotone" />
        {busy ? "Mengunggah..." : `Klik untuk unggah ${multiple ? "file" : "file"}`}
      </Button>
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f) => {
            const isImg = (f.content_type || "").startsWith("image/");
            return (
              <li key={f.id} className="flex items-center gap-3 p-2 border border-slate-200 rounded-lg bg-white" data-testid={`file-item-${f.id}`}>
                {isImg ? (
                  <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-md bg-slate-100 grid place-items-center overflow-hidden shrink-0">
                    <img src={fileUrl(f.id)} alt={f.name} className="w-full h-full object-cover" />
                  </a>
                ) : (
                  <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-md bg-sky-50 grid place-items-center shrink-0 text-sky-600">
                    <FileText size={22} weight="duotone" />
                  </a>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate text-slate-900">{f.name}</div>
                  <div className="text-xs text-slate-500">{(f.size / 1024).toFixed(1)} KB</div>
                </div>
                <button type="button" onClick={() => remove(f.id)} className="text-slate-400 hover:text-red-600 p-1" data-testid={`file-remove-${f.id}`}>
                  <Trash size={16} weight="bold" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function FileList({ files = [] }) {
  if (!files.length) return <span className="text-xs text-slate-400 italic">Tidak ada file</span>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {files.map((f) => {
        const isImg = (f.content_type || "").startsWith("image/");
        return (
          <a key={f.id} href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="block border border-slate-200 rounded-lg bg-white overflow-hidden hover:border-sky-400 transition-colors" data-testid={`view-file-${f.id}`}>
            {isImg ? (
              <img src={fileUrl(f.id)} alt={f.name || "file"} className="w-full h-24 object-cover" />
            ) : (
              <div className="w-full h-24 grid place-items-center bg-sky-50 text-sky-600">
                <FileText size={32} weight="duotone" />
              </div>
            )}
            <div className="p-2 text-xs truncate text-slate-700">{f.original_filename || f.name}</div>
          </a>
        );
      })}
    </div>
  );
}
