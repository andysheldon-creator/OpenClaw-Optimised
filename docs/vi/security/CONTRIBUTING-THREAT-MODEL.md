# Contributing to the OpenClaw Threat Model

Thanks for helping make OpenClaw more secure. This threat model is a living document and we welcome contributions from anyone - you don't need to be a security expert.

## Ways to Contribute

### Add a Threat

Spotted an attack vector or risk we haven't covered? Open an issue on [openclaw/trust](https://github.com/openclaw/trust/issues) and describe it in your own words. You don't need to know any frameworks or fill in every field - just describe the scenario.

**Helpful to include (but not required):**

- The attack scenario and how it could be exploited
- Which parts of OpenClaw are affected (CLI, gateway, channels, ClawHub, MCP servers, etc.)
- How severe you think it is (low / medium / high / critical)
- Any links to related research, CVEs, or real-world examples

We'll handle the ATLAS mapping, threat IDs, and risk assessment during review. If you want to include those details, great - but it's not expected.

> **This is for adding to the threat model, not reporting live vulnerabilities.** If you've found an exploitable vulnerability, see our [Trust page](https://trust.openclaw.ai) for responsible disclosure instructions.

### Suggest a Mitigation

Have an idea for how to address an existing threat? Open an issue or PR referencing the threat. Useful mitigations are specific and actionable - for example, "per-sender rate limiting of 10 messages/minute at the gateway" is better than "implement rate limiting."

### Propose an Attack Chain

Attack chains show how multiple threats combine into a realistic attack scenario. If you see a dangerous combination, describe the steps and how an attacker would chain them together. A short narrative of how the attack unfolds in practice is more valuable than a formal template.

### Fix or Improve Existing Content

Typos, clarifications, outdated info, better examples - PRs welcome, no issue needed.

## Những gì chúng tôi sử dụng

### MITRE ATLAS

Mô hình mối đe dọa này được xây dựng dựa trên [MITRE ATLAS](https://atlas.mitre.org/) (Bối cảnh Mối đe dọa Đối kháng cho Hệ thống AI), một khung được thiết kế chuyên biệt cho các mối đe dọa AI/ML như prompt injection, lạm dụng công cụ và khai thác agent. You don't need to know ATLAS to contribute - we map submissions to the framework during review.

### ID mối đe dọa

Mỗi mối đe dọa có một ID như `T-EXEC-003`. Các danh mục bao gồm:

| Code    | Danh mục                                |
| ------- | --------------------------------------- |
| RECON   | Trinh sát – thu thập thông tin          |
| ACCESS  | Truy cập ban đầu – giành quyền xâm nhập |
| EXEC    | Thực thi – chạy các hành động độc hại   |
| PERSIST | Persistence - maintaining access        |
| EVADE   | Né tránh phòng thủ – tránh bị phát hiện |
| DISC    | Khám phá – tìm hiểu về môi trường       |
| EXFIL   | Rò rỉ dữ liệu – đánh cắp dữ liệu        |
| IMPACT  | Tác động – gây thiệt hại hoặc gián đoạn |

ID được người duy trì gán trong quá trình xem xét. Bạn không cần phải chọn một ID.

### Mức độ rủi ro

| Mức              | Ý nghĩa                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------- |
| **Nghiêm trọng** | Xâm phạm toàn bộ hệ thống, hoặc khả năng xảy ra cao + tác động nghiêm trọng             |
| **Cao**          | Khả năng gây thiệt hại đáng kể, hoặc khả năng xảy ra trung bình + tác động nghiêm trọng |
| **Trung bình**   | Rủi ro vừa phải, hoặc khả năng xảy ra thấp + tác động cao                               |
| **Thấp**         | Khó xảy ra và tác động hạn chế                                                          |

Nếu bạn không chắc về mức độ rủi ro, chỉ cần mô tả tác động và chúng tôi sẽ đánh giá.

## Quy trình xem xét

1. **Phân loại** – Chúng tôi xem xét các nội dung gửi mới trong vòng 48 giờ
2. **Đánh giá** – Chúng tôi xác minh tính khả thi, gán ánh xạ ATLAS và ID mối đe dọa, xác nhận mức độ rủi ro
3. **Tài liệu hóa** – Chúng tôi đảm bảo mọi thứ được định dạng đầy đủ và hoàn chỉnh
4. **Hợp nhất** – Được thêm vào mô hình mối đe dọa và trực quan hóa

## Tài nguyên

- [Trang web ATLAS](https://atlas.mitre.org/)
- [Kỹ thuật ATLAS](https://atlas.mitre.org/techniques/)
- [Nghiên cứu tình huống ATLAS](https://atlas.mitre.org/studies/)
- [Mô hình mối đe dọa OpenClaw](./THREAT-MODEL-ATLAS.md)

## Liên hệ

- **Lỗ hổng bảo mật:** Xem [Trang Trust](https://trust.openclaw.ai) của chúng tôi để biết hướng dẫn báo cáo
- **Câu hỏi về mô hình mối đe dọa:** Mở một issue trên [openclaw/trust](https://github.com/openclaw/trust/issues)
- **General chat:** Discord #security channel

## Recognition

Contributors to the threat model are recognized in the threat model acknowledgments, release notes, and the OpenClaw security hall of fame for significant contributions.
