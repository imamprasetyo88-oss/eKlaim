import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Printer, BookOpen, Receipt, HandCoins, Users as UsersIcon, Wallet, Stamp, CheckCircle, Question, Warning, Buildings, ArrowsClockwise } from "@phosphor-icons/react";

const SECTIONS = [
  { id: "pengantar", label: "1. Pengantar", icon: BookOpen },
  { id: "role", label: "2. Peran Pengguna", icon: UsersIcon },
  { id: "alur-klaim", label: "3. Alur Klaim (Reimbursement)", icon: Receipt },
  { id: "alur-um", label: "4. Alur Uang Muka", icon: HandCoins },
  { id: "alur-topup", label: "5. Alur Top-up Petty Cash", icon: ArrowsClockwise },
  { id: "panduan-user", label: "6. Panduan User", icon: Receipt },
  { id: "panduan-verifikator", label: "7. Panduan Verifikator", icon: CheckCircle },
  { id: "panduan-atasan", label: "8. Panduan Atasan", icon: Stamp },
  { id: "panduan-finance", label: "9. Panduan Finance", icon: Wallet },
  { id: "panduan-admin", label: "10. Panduan Admin", icon: Buildings },
  { id: "panduan-auditor", label: "11. Panduan Auditor", icon: BookOpen },
  { id: "faq", label: "12. FAQ", icon: Question },
  { id: "troubleshooting", label: "13. Troubleshooting", icon: Warning },
];

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 pb-10">
      <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-sky-500" style={{fontFamily:'Manrope'}}>{title}</h2>
      <div className="space-y-4 text-sm text-slate-700 leading-relaxed">{children}</div>
    </section>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 grid place-items-center font-bold shrink-0">{n}</div>
      <div className="flex-1">
        <div className="font-semibold text-slate-900">{title}</div>
        <div className="text-sm text-slate-600 mt-1">{children}</div>
      </div>
    </div>
  );
}

function FAQ({ q, children }) {
  return (
    <details className="lyra-card p-4 group">
      <summary className="font-semibold text-slate-900 cursor-pointer flex items-center justify-between">
        <span>{q}</span>
        <span className="text-sky-600 group-open:rotate-45 transition-transform text-xl">+</span>
      </summary>
      <div className="mt-3 text-sm text-slate-700 space-y-2">{children}</div>
    </details>
  );
}

function StatusFlow({ steps }) {
  return (
    <div className="lyra-card p-4 bg-sky-50/50 border-sky-200">
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${s.color || "bg-white border border-slate-200 text-slate-700"}`}>{s.label}</span>
            {i < steps.length - 1 && <span className="text-slate-400">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Panduan() {
  const { user } = useAuth();
  const [q, setQ] = useState("");

  const doPrint = () => window.print();

  return (
    <div className="max-w-6xl" data-testid="panduan-page">
      <style>{`
        @media print {
          aside, header, [data-testid="panduan-toc"], [data-testid="panduan-print"] { display: none !important; }
          main { padding: 0 !important; }
          section { page-break-inside: avoid; }
          details { border: 1px solid #ccc; }
          details > summary { list-style: none; }
        }
      `}</style>

      <div className="flex items-start justify-between flex-wrap gap-4 mb-6 print:block">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2" style={{fontFamily:'Manrope'}}>
            <BookOpen size={28} weight="duotone" className="text-sky-600" /> Panduan Pengguna eKlaim
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manual lengkap untuk semua peran — {user?.company?.name || "eKlaim"}. Anda login sebagai <b>{user?.role}</b>.
          </p>
        </div>
        <Button data-testid="panduan-print" onClick={doPrint} variant="outline">
          <Printer size={16} className="mr-1.5" weight="duotone" /> Cetak / Simpan PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1 print:hidden" data-testid="panduan-toc">
          <div className="lyra-card p-4 sticky top-24">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Daftar Isi</div>
            <nav className="space-y-1">
              {SECTIONS.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition-colors">
                  <s.icon size={14} weight="duotone"/><span>{s.label}</span>
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-2">
          <Section id="pengantar" title="1. Pengantar">
            <p><b>eKlaim</b> adalah sistem digital untuk mengelola klaim biaya operasional harian kantor dan uang muka, terintegrasi dengan petty cash. Aplikasi ini menggantikan proses manual (form kertas + tanda tangan basah) menjadi digital yang dapat diaudit.</p>
            <p><b>Data terisolasi per perusahaan.</b> Setiap perusahaan (misalnya Lyra Akrelux dan Sunda Kelapa Pustaka) memiliki data, admin, dan petty cash sendiri-sendiri.</p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="lyra-card p-3 bg-sky-50 border-sky-200">
                <div className="font-semibold text-sky-900 flex items-center gap-1"><Receipt size={16} weight="duotone"/>Klaim (Reimbursement)</div>
                <div className="text-xs text-sky-800 mt-1">Anda keluar uang sendiri dulu, lalu klaim untuk diganti.</div>
              </div>
              <div className="lyra-card p-3 bg-emerald-50 border-emerald-200">
                <div className="font-semibold text-emerald-900 flex items-center gap-1"><HandCoins size={16} weight="duotone"/>Uang Muka</div>
                <div className="text-xs text-emerald-800 mt-1">Anda terima uang dulu, belanja, lalu lapor bukti aktual.</div>
              </div>
            </div>
          </Section>

          <Section id="role" title="2. Peran Pengguna (6 Role)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {r: "User", d: "Karyawan yang mengajukan klaim atau uang muka."},
                {r: "Verifikator", d: "Cek kelengkapan dokumen, transfer petty cash, konfirmasi realisasi UM, request top-up."},
                {r: "Atasan", d: "Approve/reject klaim & uang muka yang sudah lolos verifikasi."},
                {r: "Finance", d: "Approve top-up petty cash & upload bukti transfer."},
                {r: "Admin", d: "Kelola user, kategori, saldo petty cash awal. Tidak bisa lihat perusahaan lain."},
                {r: "Auditor", d: "Read-only. Bisa lihat semua data & audit trail, tapi tidak bisa mengubah apa pun."},
              ].map((x, i) => (
                <div key={i} className="lyra-card p-3">
                  <div className="font-semibold text-slate-900">{x.r}</div>
                  <div className="text-xs text-slate-600 mt-1">{x.d}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="alur-klaim" title="3. Alur Klaim (Reimbursement)">
            <p>Alur untuk klaim ini dari user mengeluarkan uang sendiri → sistem mengembalikannya.</p>
            <StatusFlow steps={[
              {label:"Draft", color:"bg-slate-100 text-slate-700"},
              {label:"Diajukan", color:"bg-blue-100 text-blue-700"},
              {label:"Menunggu Approval", color:"bg-purple-100 text-purple-700"},
              {label:"Siap Dibayar", color:"bg-orange-100 text-orange-700"},
              {label:"Selesai", color:"bg-emerald-100 text-emerald-700"},
            ]} />
            <p className="text-xs text-slate-500 italic">Cabang: dari <b>Diajukan</b>, verifikator bisa mengembalikan untuk <b>Koreksi</b> atau <b>Menolak</b>. Dari <b>Menunggu Approval</b>, atasan bisa <b>Menolak</b>.</p>
          </Section>

          <Section id="alur-um" title="4. Alur Uang Muka">
            <p>Alur untuk uang diberikan dulu ke user, kemudian user lapor bukti aktualnya:</p>
            <StatusFlow steps={[
              {label:"Draft"},
              {label:"Menunggu Verifikasi"},
              {label:"Menunggu Approval"},
              {label:"Menunggu Transfer", color:"bg-orange-100 text-orange-700"},
              {label:"Menunggu Bukti", color:"bg-teal-100 text-teal-700"},
              {label:"Menunggu Konfirmasi"},
              {label:"Selesai", color:"bg-emerald-100 text-emerald-700"},
            ]} />
            <div className="lyra-card p-4 bg-amber-50 border-amber-200">
              <div className="font-semibold text-amber-900 mb-2">Penanganan Selisih Otomatis</div>
              <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
                <li>Kalau <b>realisasi &lt; uang muka</b>: sisa otomatis masuk balik ke petty cash</li>
                <li>Kalau <b>realisasi &gt; uang muka</b>: petty cash bayar kekurangan (verifikator konfirmasi)</li>
                <li>Kalau <b>pas</b>: tidak ada perubahan saldo</li>
              </ul>
            </div>
          </Section>

          <Section id="alur-topup" title="5. Alur Top-up Petty Cash">
            <p>Bila saldo petty cash mulai menipis, verifikator dapat request top-up ke Finance untuk mengisi ulang.</p>
            <StatusFlow steps={[
              {label:"Verifikator klik Request Top-up"},
              {label:"Menunggu Finance", color:"bg-blue-100 text-blue-700"},
              {label:"Finance approve + upload bukti transfer"},
              {label:"Selesai", color:"bg-emerald-100 text-emerald-700"},
            ]} />
            <p className="text-xs text-slate-500">Setelah top-up disetujui, saldo petty cash otomatis bertambah sesuai jumlah yang di-request.</p>
          </Section>

          <Section id="panduan-user" title="6. Panduan User (Karyawan)">
            <h3 className="font-semibold text-slate-900" style={{fontFamily:'Manrope'}}>Mengajukan Klaim</h3>
            <div className="space-y-3">
              <Step n={1} title="Buka menu 'Ajukan Klaim' di sidebar">Klik <b>Ajukan Klaim</b>.</Step>
              <Step n={2} title="Unggah foto struk">Klik tombol besar bergaris putus-putus, pilih foto struk. Anda bisa unggah lebih dari 1 foto.</Step>
              <Step n={3} title="Klik 'OCR Otomatis' (opsional)">Sistem akan membaca struk dan mengisi otomatis jumlah, tanggal, dan menebak kategori. Anda tetap bisa edit manual jika hasil OCR kurang tepat.</Step>
              <Step n={4} title="Pilih kategori & isi detail">Contoh: Karcis Tol, deskripsi "Tol PP ke Bandung untuk meeting client".</Step>
              <Step n={5} title="Klik 'Ajukan ke Verifikator'">Status berubah jadi <b>Diajukan</b>. Anda bisa pantau status di menu <b>Klaim Saya</b>.</Step>
            </div>

            <h3 className="font-semibold text-slate-900 mt-6" style={{fontFamily:'Manrope'}}>Mengajukan Uang Muka</h3>
            <div className="space-y-3">
              <Step n={1} title="Buka 'Ajukan Uang Muka'">Isi kategori, jumlah, dan deskripsi keperluan.</Step>
              <Step n={2} title="Tunggu approval">Verifikator → Atasan → Verifikator akan transfer uang. Anda dapat notifikasi di dashboard.</Step>
              <Step n={3} title="Setelah terima transfer, belanja seperti biasa">Simpan struk aslinya.</Step>
              <Step n={4} title="Upload bukti realisasi">Buka detail UM Anda, klik <b>Upload Bukti Realisasi</b>. Isi jumlah aktual yang benar-benar terpakai. Kalau ada sisa, upload bukti pengembalian ke rekening perusahaan.</Step>
              <Step n={5} title="Verifikator akan konfirmasi">Setelah dikonfirmasi, status berubah <b>Selesai</b>.</Step>
            </div>

            <h3 className="font-semibold text-slate-900 mt-6" style={{fontFamily:'Manrope'}}>Kalau Klaim Dikembalikan (Perlu Koreksi)</h3>
            <p>Buka detail klaim → lihat catatan verifikator di bagian bawah → klik <b>Edit</b> → perbaiki → <b>Ajukan</b> ulang.</p>
          </Section>

          <Section id="panduan-verifikator" title="7. Panduan Verifikator">
            <h3 className="font-semibold text-slate-900" style={{fontFamily:'Manrope'}}>Verifikasi Klaim</h3>
            <div className="space-y-3">
              <Step n={1} title="Buka menu 'Verifikasi'">Lihat antrean klaim status <b>Diajukan</b>.</Step>
              <Step n={2} title="Klik baris klaim">Cek kelengkapan: bukti struk jelas terbaca, jumlah wajar, deskripsi masuk akal.</Step>
              <Step n={3} title="Pilih aksi">
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li><b>Setuju & Lanjut ke Atasan</b> — kalau semua ok</li>
                  <li><b>Kembalikan untuk Koreksi</b> — kalau ada yang kurang (isi catatan)</li>
                  <li><b>Tolak</b> — kalau klaim tidak valid (isi alasan)</li>
                </ul>
              </Step>
            </div>

            <h3 className="font-semibold text-slate-900 mt-6" style={{fontFamily:'Manrope'}}>Bayar Klaim (Setelah Atasan Approve)</h3>
            <div className="space-y-3">
              <Step n={1} title="Buka menu 'Pembayaran'">Lihat klaim status <b>Siap Dibayar</b>.</Step>
              <Step n={2} title="Transfer uang ke rekening user">Pakai mobile banking / cash sesuai kebijakan.</Step>
              <Step n={3} title="Kembali ke aplikasi, klik 'Bayar & Upload Bukti Transfer'">Upload screenshot mutasi/kwitansi. Saldo petty cash akan otomatis berkurang.</Step>
            </div>

            <h3 className="font-semibold text-slate-900 mt-6" style={{fontFamily:'Manrope'}}>Transfer & Konfirmasi Uang Muka</h3>
            <p>Untuk UM ada 2 aksi terpisah:</p>
            <ul className="list-disc list-inside">
              <li><b>Transfer UM</b> — setelah atasan approve. Transfer uang muka → upload bukti transfer → petty cash keluar.</li>
              <li><b>Konfirmasi UM</b> — setelah user upload bukti realisasi. Cek bukti struk aktualnya cocok, lalu klik Konfirmasi. Sistem otomatis settle selisih ke petty cash.</li>
            </ul>

            <h3 className="font-semibold text-slate-900 mt-6" style={{fontFamily:'Manrope'}}>Request Top-up Petty Cash</h3>
            <p>Bila saldo mulai menipis, buka menu <b>Petty Cash</b> → klik <b>Request Top-up</b> → isi jumlah → catatan → kirim ke Finance.</p>
          </Section>

          <Section id="panduan-atasan" title="8. Panduan Atasan">
            <div className="space-y-3">
              <Step n={1} title="Buka menu 'Approval Atasan'">Lihat antrean klaim/UM yang sudah lolos verifikasi.</Step>
              <Step n={2} title="Klik detail">Baca deskripsi, tujuan, jumlah, dan lihat bukti struk.</Step>
              <Step n={3} title="Setujui atau Tolak">Kalau tolak, wajib isi alasan di kolom catatan.</Step>
            </div>
            <p className="text-xs text-slate-500 italic mt-3">Setelah Anda approve, klaim langsung diteruskan ke verifikator untuk dibayar. Untuk UM, verifikator akan transfer uang muka.</p>
          </Section>

          <Section id="panduan-finance" title="9. Panduan Finance">
            <div className="space-y-3">
              <Step n={1} title="Buka menu 'Top-up Petty Cash'">Lihat request dari verifikator.</Step>
              <Step n={2} title="Klik baris request">Cek jumlah dan catatan.</Step>
              <Step n={3} title="Transfer ke rekening petty cash">Sesuai kebijakan perusahaan.</Step>
              <Step n={4} title="Klik 'Setujui & Transfer'">Upload bukti transfer. Saldo petty cash akan otomatis bertambah.</Step>
            </div>
          </Section>

          <Section id="panduan-admin" title="10. Panduan Admin">
            <h3 className="font-semibold text-slate-900" style={{fontFamily:'Manrope'}}>Setup Awal</h3>
            <div className="space-y-3">
              <Step n={1} title="Buat akun karyawan">Menu <b>Pengguna</b> → <b>+ Pengguna Baru</b>. Pilih role sesuai posisi.</Step>
              <Step n={2} title="Sesuaikan kategori">Menu <b>Kategori</b> → tambah/edit/nonaktifkan sesuai kebutuhan perusahaan Anda.</Step>
              <Step n={3} title="Atur saldo petty cash awal">Menu <b>Pengaturan</b> → ubah nominal saldo awal. Sistem akan reset saldo sekarang ke nilai ini.</Step>
              <Step n={4} title="Ganti password admin default">Menu <b>Pengaturan</b> → Ganti Password. Default admin123 <b>WAJIB</b> diganti sebelum produksi.</Step>
            </div>
            <h3 className="font-semibold text-slate-900 mt-6" style={{fontFamily:'Manrope'}}>Operasional Harian</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Reset password user yang lupa: menu <b>Pengguna</b> → ikon kunci</li>
              <li>Nonaktifkan user yang resign: ikon minus (jangan hapus — untuk jejak audit)</li>
              <li>Pantau dashboard untuk lihat antrean menumpuk</li>
              <li>Cek <b>Rekonsiliasi</b> untuk pastikan saldo petty cash cocok dengan mutasi</li>
            </ul>
          </Section>

          <Section id="panduan-auditor" title="11. Panduan Auditor">
            <p>Auditor bersifat read-only — bisa lihat semua data tapi tidak bisa membuat/mengubah/menghapus apapun.</p>
            <ul className="list-disc list-inside space-y-1">
              <li><b>Audit Trail</b> — jejak semua aksi user (siapa, kapan, apa)</li>
              <li><b>Laporan</b> — filter klaim per periode, kategori, status, lalu download CSV</li>
              <li><b>Rekonsiliasi</b> — verifikasi kesesuaian saldo dengan mutasi</li>
            </ul>
          </Section>

          <Section id="faq" title="12. Pertanyaan Umum (FAQ)">
            <div className="space-y-3">
              <FAQ q="Kenapa klaim saya 'Perlu Koreksi'?">Verifikator meminta perbaikan. Buka detail klaim → lihat catatan verifikator di bagian bawah → klik Edit → perbaiki → Ajukan ulang.</FAQ>
              <FAQ q="Bagaimana kalau OCR salah baca angka?">Anda tetap bisa edit manual di form. OCR hanya bantuan awal — akurasi tergantung kualitas foto (pencahayaan, sudut, kejernihan).</FAQ>
              <FAQ q="Bagaimana kalau uang muka lebih besar dari realisasi?">Isi jumlah aktual di form realisasi. Sisanya WAJIB dikembalikan ke rekening perusahaan. Upload bukti setornya di kolom "Bukti Pengembalian Sisa". Verifikator akan konfirmasi dan sistem otomatis catat pemasukan ke petty cash.</FAQ>
              <FAQ q="Bagaimana kalau realisasi lebih besar dari uang muka?">Setelah Anda kirim realisasi, verifikator akan konfirmasi & petty cash otomatis bayar selisihnya. Kalau saldo petty cash tidak cukup, verifikator harus request top-up dulu ke Finance.</FAQ>
              <FAQ q="Bagaimana kalau petty cash habis waktu ada klaim mendesak?">Verifikator klik menu Petty Cash → Request Top-up → Finance approve → saldo terisi kembali. Setelah itu klaim baru bisa dibayar.</FAQ>
              <FAQ q="Bagaimana cara ganti password?">Menu <b>Pengaturan</b> → Ganti Password. Isi password lama & baru.</FAQ>
              <FAQ q="Saya lupa password, bagaimana?">Hubungi admin perusahaan Anda. Admin bisa reset password lewat menu Pengguna.</FAQ>
              <FAQ q="Kenapa saya tidak lihat data dari perusahaan lain?">Sistem multi-tenant: data Lyra dan SKP terpisah 100%. Kalau Anda karyawan Lyra, Anda hanya lihat data Lyra. Ini disengaja.</FAQ>
              <FAQ q="Apakah bisa hapus klaim yang sudah diajukan?">Tidak. Hanya klaim status Draft yang bisa dihapus. Klaim yang sudah diajukan hanya bisa dikoreksi atau ditolak oleh verifikator/atasan.</FAQ>
              <FAQ q="Bagaimana format file yang bisa diupload?">JPG, PNG, WebP, dan PDF. Ukuran maksimum 10 MB per file.</FAQ>
              <FAQ q="Berapa lama proses klaim biasanya?">Tergantung kecepatan verifikator dan atasan approve. Sistem tidak memiliki batas waktu — pantau dashboard untuk lihat antrean.</FAQ>
              <FAQ q="Bisakah saya ajukan klaim atas nama orang lain?">Tidak. Setiap user hanya bisa mengajukan klaim atas namanya sendiri untuk transparansi audit.</FAQ>
              <FAQ q="Bagaimana kalau atasan saya cuti?">Admin perusahaan bisa sementara memberikan role Atasan ke orang lain. Setelah kembali, admin ubah lagi.</FAQ>
              <FAQ q="Apakah data pengeluaran bisa di-export untuk finance?">Ya. Menu <b>Laporan</b> → filter periode/kategori/status → klik <b>Download CSV</b>. File bisa dibuka di Excel.</FAQ>
              <FAQ q="Kenapa saldo petty cash tidak cocok dengan mutasi?">Buka menu <b>Rekonsiliasi</b> untuk lihat detail perhitungan. Kalau ada selisih, biasanya karena manual override saldo awal — laporkan ke admin.</FAQ>
            </div>
          </Section>

          <Section id="troubleshooting" title="13. Troubleshooting">
            <div className="space-y-3">
              <FAQ q="Tidak bisa login: 'Username atau password salah'">
                <ul className="list-disc list-inside">
                  <li>Pastikan Anda pilih <b>perusahaan yang benar</b> di dropdown</li>
                  <li>Username case-sensitive (lowercase)</li>
                  <li>Kalau lupa password, minta admin reset</li>
                </ul>
              </FAQ>
              <FAQ q="File upload gagal">
                <ul className="list-disc list-inside">
                  <li>Cek ukuran file &lt; 10 MB</li>
                  <li>Format harus JPG/PNG/WebP/PDF</li>
                  <li>Cek koneksi internet</li>
                </ul>
              </FAQ>
              <FAQ q="OCR tidak akurat">
                <ul className="list-disc list-inside">
                  <li>Pastikan foto struk tidak buram/gelap</li>
                  <li>Ambil foto lurus (tidak miring)</li>
                  <li>Kalau tetap salah, edit manual saja — OCR hanya bantuan</li>
                </ul>
              </FAQ>
              <FAQ q="Tombol Bayar tidak muncul">
                <ul className="list-disc list-inside">
                  <li>Pastikan status klaim <b>Siap Dibayar</b> (bukan Menunggu Approval)</li>
                  <li>Pastikan Anda login sebagai <b>Verifikator</b></li>
                </ul>
              </FAQ>
              <FAQ q="Saldo petty cash tidak cukup untuk bayar klaim">Request top-up dulu ke Finance lewat menu Petty Cash → Request Top-up.</FAQ>
              <FAQ q="Halaman blank / error">Coba refresh browser (Ctrl+F5). Kalau masih, screenshot error dan laporkan ke admin.</FAQ>
            </div>

            <div className="lyra-card p-4 bg-sky-50 border-sky-200 mt-6">
              <div className="font-semibold text-sky-900">📞 Butuh bantuan lebih lanjut?</div>
              <p className="text-sm text-sky-800 mt-1">Hubungi admin perusahaan Anda ({user?.company?.name || "-"}) atau tim IT internal untuk masalah yang tidak tercakup di panduan ini.</p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
