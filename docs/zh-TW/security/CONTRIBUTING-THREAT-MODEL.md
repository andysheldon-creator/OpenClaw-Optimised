# 25. 貢獻於 OpenClaw 威脅模型

26. 感謝你協助讓 OpenClaw 更安全。 27. 這份威脅模型是一份持續演進的文件，我們歡迎任何人貢獻——你不需要是資安專家。

## 28. 貢獻方式

### 29. 新增威脅

30. 發現我們尚未涵蓋的攻擊向量或風險？ 31. 在 [openclaw/trust](https://github.com/openclaw/trust/issues) 開啟一個 issue，並用你自己的話描述。 32. 你不需要了解任何框架或填寫每個欄位——只要描述情境即可。

33. **有幫助但非必要：**

- 34. 攻擊情境以及可能如何被利用
- 35. 受影響的 OpenClaw 組件（CLI、gateway、channels、ClawHub、MCP servers 等）
- 36. 你認為嚴重程度為何（低 / 中 / 高 / 致命）
- 37. 任何相關研究、CVE 或真實案例的連結

38. 我們會在審查期間處理 ATLAS 對應、威脅 ID 與風險評估。 39. 若你想包含這些細節也很好——但並非必要。

> 40. **這是用於新增至威脅模型，而非回報即時漏洞。** 若你發現可被利用的漏洞，請參閱我們的 [Trust page](https://trust.openclaw.ai) 以取得負責任揭露的指引。

### 41. 建議緩解措施

42. 有想法可以解決既有威脅嗎？ 43. 開啟一個 issue 或 PR 並引用該威脅。 44. 有效的緩解措施應具體且可執行——例如，「在 gateway 進行每個傳送者每分鐘 10 則訊息的速率限制」比「實作速率限制」更好。

### 45. 提出攻擊鏈

46. 攻擊鏈展示多個威脅如何結合成一個真實的攻擊情境。 47. 若你看到危險的組合，請描述步驟以及攻擊者會如何將它們串連。 48. 描述攻擊在實務中如何展開的簡短敘事，比正式範本更有價值。

### 49. 修正或改進既有內容

50. 錯字、釐清說明、過時資訊、更好的範例——歡迎 PR，無需先開 issue。

## 1. 我們使用的內容

### 2. MITRE ATLAS

3. 此威脅模型建立於 [MITRE ATLAS](https://atlas.mitre.org/)（AI 系統的對抗性威脅版圖），這是一個專為 AI/ML 威脅（如提示注入、工具濫用與代理人利用）所設計的框架。 4. 你不需要了解 ATLAS 也能貢獻——我們會在審查期間將提交內容對應到該框架。

### 5. 威脅 ID

6. 每個威脅都會取得一個像是 `T-EXEC-003` 的 ID。 7. 類別如下：

| 程式碼                                | 40. 類別                       |
| ---------------------------------- | --------------------------------------------------- |
| 10. RECON   | 11. 偵察（Reconnaissance）— 資訊蒐集 |
| 12. ACCESS  | 13. 初始存取 — 取得進入權限            |
| 14. EXEC    | 15. 執行 — 執行惡意行為              |
| 16. PERSIST | 17. 持久化 — 維持存取權限             |
| 18. EVADE   | 19. 防禦規避 — 避免被偵測             |
| 20. DISC    | 21. 探索 — 了解環境                |
| 22. EXFIL   | 23. 資料外洩 — 竊取資料              |
| 24. IMPACT  | 25. 影響 — 造成損害或中斷             |

26. ID 由維護者在審查期間指派。 27. 你不需要自行選擇一個。

### 28. 風險等級

| 29. 等級               | 30. 含義                      |
| ------------------------------------------- | -------------------------------------------------- |
| 31. **嚴重（Critical）** | 32. 完整系統遭到入侵，或高發生機率 + 嚴重影響  |
| 33. **高（High）**      | 34. 可能造成重大損害，或中等發生機率 + 嚴重影響 |
| 35. **中（Medium）**    | 36. 中度風險，或低發生機率 + 高影響       |
| 37. **低（Low）**       | 38. 發生機率低且影響有限              |

39. 若你不確定風險等級，只需描述影響，我們會進行評估。

## 40. 審查流程

1. 41. **分流（Triage）** — 我們會在 48 小時內審查新的提交內容
2. 42. **評估（Assessment）** — 驗證可行性、指派 ATLAS 對應與威脅 ID、驗證風險等級
3. 43. **文件化（Documentation）** — 確保所有內容格式正確且完整
4. 44. **合併（Merge）** — 新增至威脅模型與視覺化

## 45) 資源

- 46. [ATLAS 網站](https://atlas.mitre.org/)
- 47. [ATLAS 技術](https://atlas.mitre.org/techniques/)
- 48. [ATLAS 案例研究](https://atlas.mitre.org/studies/)
- 49. [OpenClaw 威脅模型](./THREAT-MODEL-ATLAS.md)

## 50. 聯絡方式

- **Security vulnerabilities:** See our [Trust page](https://trust.openclaw.ai) for reporting instructions
- **Threat model questions:** Open an issue on [openclaw/trust](https://github.com/openclaw/trust/issues)
- **General chat:** Discord #security channel

## Recognition

Contributors to the threat model are recognized in the threat model acknowledgments, release notes, and the OpenClaw security hall of fame for significant contributions.
