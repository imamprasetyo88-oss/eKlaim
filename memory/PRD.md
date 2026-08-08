# eKlaim Lyra - Petty Cash & Expense Claim System

## Company: Lyra Akrelux
Sistem klaim biaya operasional harian kantor dengan alur verifikasi berjenjang dan pengelolaan petty cash.

## Roles
- **admin**: create users, categories, set petty cash initial balance
- **user**: create/edit/submit claims, upload receipts
- **verifikator**: verify claims, execute payment from petty cash, request top-up
- **atasan**: approve/reject claims that passed verification
- **finance**: approve top-up requests and refill petty cash
- **auditor**: read-only, view all data + audit trail

## Claim Flow
DRAFT → DIAJUKAN → (Verifikator) → PERLU_KOREKSI / MENUNGGU_APPROVAL / DITOLAK
                                    ↓
                                    (Atasan) → DITOLAK / MENUNGGU_PEMBAYARAN
                                                        ↓
                                                        (Verifikator bayar dari petty cash) → DIBAYAR

## Top-up Flow (manual, on-demand)
Verifikator klik "Request Top-up" → MENUNGGU_FINANCE → (Finance approve + upload bukti transfer) → SELESAI
                                                       Petty cash bertambah

## Petty Cash
- Default saldo awal: Rp 5.000.000 (admin bisa ubah di Pengaturan)
- Real-time balance, transaction log (IN/OUT)
- Rekonsiliasi otomatis: saldo_awal + IN - OUT = saldo_sekarang

## Key Features Delivered
- JWT-based auth (username+password), admin creates all users
- 6 default categories (Karcis Tol, BBM, ATK, Kebersihan, Konsumsi)
- Multi-file upload for receipts & transfer proofs via object storage
- OCR foto struk via GPT-5.6 Terra Vision (auto-fill jumlah/tanggal/merchant/kategori)
- Dashboard analytics: 30-day trend, top categories 60-day, action queue per role
- Rekonsiliasi otomatis dengan balance check
- Audit trail lengkap semua aksi
- Laporan dengan filter + CSV export (UTF-8 BOM untuk Excel)
- Bahasa Indonesia sepenuhnya
- Corporate blue (sky-600) + putih, Manrope + IBM Plex Sans fonts, Phosphor icons

## Backlog
- P1: PDF voucher per klaim
- P1: WhatsApp/Email notifications
- P1: Batas bulanan per user/kategori
- P2: Approval multi-level berdasarkan nilai
- P2: Cash Advance workflow
- P2: Sub-kategori
