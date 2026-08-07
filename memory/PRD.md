# Inventory Decision Support System (IDSS) — PRD

## Original Problem Statement
Modern web app called Inventory Decision Support System (IDSS). NOT ERP, NOT WMS. Decision Support System to help Purchasing, Warehouse, PPIC and Directors monitor inventory health and create purchase planning recommendations. Medium-large distribution companies. Clean UI similar to Power BI / Notion / Linear. Light theme. Blue (#2563eb) + Orange (#f97316).

## User Choices
- LLM: GPT 5.6 Terra (Emergent LLM key)
- No auth
- Start empty, upload Excel
- Server-side Excel parsing (openpyxl)
- Deep focus: Dashboard + Purchase Planning (all 9 menus present)

## Architecture
- Backend: FastAPI (single `server.py`), MongoDB, openpyxl for Excel, emergentintegrations for LLM
- Frontend: React 19 + shadcn/ui + Recharts + lucide-react + sonner toasts
- All /api routes; env-driven URLs

## What's Implemented (2026-02)
- 9 menu pages, sidebar, global search, AI Insight Panel
- Dashboard: 10 KPI cards, 4 alert panels (red/orange/yellow/green), 4 charts (sales trend, PO timeline, by category, by supplier), AI panel
- Data Upload: 4 file types with duplicate detection + upload history
- Master Data: Items, Factories, Campaigns CRUD (tabs)
- Inventory Monitoring: full table with ABC, coverage, projected, aging, status labels + filters
- Purchase Planning: recommendations with MOQ rounding (pallet + factory MOQ), factory MOQ satisfaction cards, urgency, deadlines
- Purchase Calendar: grouped events (ETAs + Scheduled deadlines), late PO panel
- Business Rules: 10 default rules with toggle
- Reports: 8 pre-built reports with CSV export
- Settings + demo seed + danger zone
- AI Insight via GPT 5.6 Terra + rule-based fallback

## Backlog
- P1: PDF/Excel exports (only CSV so far)
- P1: Edit-in-place for items, factories, campaigns (currently add + delete)
- P1: Sales forecasting (moving average / seasonality)
- P2: Multi-warehouse projection detail
- P2: Notifications 5 days before scheduled purchase
- P2: Advanced filters sidebar (warehouse, brand)
