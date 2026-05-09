---
name: Incremental scaffolding — chỉ tạo file khi sắp dùng
description: User yêu cầu mỗi phase chỉ tạo folder/file thực sự cần cho phase đó, không pre-create cấu trúc rỗng cho phase sau
type: feedback
---

Rule: Khi làm dự án DATN HaUI (và mọi project tương tự), scaffold theo từng phase, KHÔNG dựng cây folder/file đầy đủ ngay từ đầu.

Cụ thể:
1. Chỉ tạo file/folder khi sắp viết code vào đó. Không tạo file rỗng "chuẩn bị cho phase sau".
2. Không tạo `.gitkeep` cho folder rỗng. Không tạo `__init__.py` rỗng nếu Python package đó chưa có module thực sự (chỉ tạo `__init__.py` khi folder đã có module Python cần được import như package).
3. Mỗi phase phải tự chạy được standalone — phase 1 xong là `uvicorn app.main:app` chạy được, không có code "stub" cho LLM/ComfyUI/etc.
4. Commit cuối mỗi phase với message `feat: phase N - <mô tả ngắn>`. Cho phép revert nếu refactor sai.
5. Alembic migration: 1 migration / 1 phase có schema change. Không gộp nhiều schema change vào 1 migration.

**Why:** User là pattern senior engineer — structure lớn theo code, không over-design upfront. Folder rỗng + file stub gây nhiễu, khó review, và rủi ro tạo abstraction sai trước khi biết shape thực tế.

**How to apply:** Khi user nói "làm phase X", chỉ tạo các file nằm trong scope phase đó theo mapping ở `project_datn_overview.md`. Không tạo folder/file cho phase sau dù biết trước cuối cùng sẽ có. Đặc biệt KHÔNG tạo các package skeleton kiểu `app/llm/__init__.py` ở phase 1 chỉ vì biết phase 2 sẽ cần — chỉ tạo khi phase 2 thực sự bắt đầu.
