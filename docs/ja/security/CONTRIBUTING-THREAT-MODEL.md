# OpenClaw 脅威モデルへの貢献

OpenClaw をより安全にするためのご協力ありがとうございます。 この脅威モデルは生きたドキュメントであり、セキュリティの専門家でなくても、どなたからの貢献も歓迎します。

## 貢献方法

### 脅威を追加する

まだカバーされていない攻撃ベクトルやリスクを見つけましたか？ [openclaw/trust](https://github.com/openclaw/trust/issues) に Issue を作成し、ご自身の言葉で説明してください。 フレームワークを知っている必要はなく、すべての項目を埋める必要もありません。シナリオを説明するだけで十分です。

**含めると役立つ項目（必須ではありません）:**

- 攻撃シナリオと、それがどのように悪用され得るか
- 影響を受ける OpenClaw の部分（CLI、gateway、channels、ClawHub、MCP サーバーなど）
- 深刻度の見積もり（low / medium / high / critical）
- 関連する研究、CVE、または実世界の事例へのリンク

ATLAS マッピング、脅威 ID、リスク評価はレビュー時にこちらで対応します。 それらの詳細を含めたい場合は歓迎しますが、必須ではありません。

> **これは脅威モデルへの追加のためのものです。現在進行中の脆弱性の報告ではありません。** 悪用可能な脆弱性を発見した場合は、責任ある開示手順について [Trust ページ](https://trust.openclaw.ai) を参照してください。

### 緩和策を提案する

既存の脅威に対処するアイデアはありますか？ その脅威を参照する Issue または PR を作成してください。 有用な緩和策は具体的で実行可能です。たとえば「ゲートウェイで送信者ごとに 10 メッセージ/分のレート制限を行う」は、「レート制限を実装する」よりも優れています。

### 攻撃チェーンを提案する

Attack chains show how multiple threats combine into a realistic attack scenario. If you see a dangerous combination, describe the steps and how an attacker would chain them together. A short narrative of how the attack unfolds in practice is more valuable than a formal template.

### Fix or Improve Existing Content

Typos, clarifications, outdated info, better examples - PRs welcome, no issue needed.

## What We Use

### MITRE ATLAS

This threat model is built on [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems), a framework designed specifically for AI/ML threats like prompt injection, tool misuse, and agent exploitation. You don't need to know ATLAS to contribute - we map submissions to the framework during review.

### Threat IDs

Each threat gets an ID like `T-EXEC-003`. The categories are:

| Code    | Category                                   |
| ------- | ------------------------------------------ |
| RECON   | Reconnaissance - information gathering     |
| ACCESS  | Initial access - gaining entry             |
| EXEC    | Execution - running malicious actions      |
| PERSIST | Persistence - maintaining access           |
| EVADE   | Defense evasion - avoiding detection       |
| DISC    | Discovery - learning about the environment |
| EXFIL   | Exfiltration - stealing data               |
| IMPACT  | Impact - damage or disruption              |

IDs are assigned by maintainers during review. You don't need to pick one.

### Risk Levels

| Level        | Meaning                                                           |
| ------------ | ----------------------------------------------------------------- |
| **Critical** | Full system compromise, or high likelihood + critical impact      |
| **High**     | Significant damage likely, or medium likelihood + critical impact |
| **Medium**   | Moderate risk, or low likelihood + high impact                    |
| **Low**      | Unlikely and limited impact                                       |

If you're unsure about the risk level, just describe the impact and we'll assess it.

## Review Process

1. **Triage** - We review new submissions within 48 hours
2. **Assessment** - We verify feasibility, assign ATLAS mapping and threat ID, validate risk level
3. **Documentation** - We ensure everything is formatted and complete
4. **Merge** - Added to the threat model and visualization

## Resources

- [ATLAS ウェブサイト](https://atlas.mitre.org/)
- [ATLAS 技術](https://atlas.mitre.org/techniques/)
- [ATLAS ケーススタディ](https://atlas.mitre.org/studies/)
- [OpenClaw 脅威モデル](./THREAT-MODEL-ATLAS.md)

## お問い合わせ

- **セキュリティ脆弱性:** 報告手順については [Trust ページ](https://trust.openclaw.ai) をご覧ください
- **脅威モデルに関する質問:** [openclaw/trust](https://github.com/openclaw/trust/issues) で Issue を作成してください
- **一般チャット:** Discord の #security チャンネル

## 謝辞

脅威モデルへの貢献者は、重要な貢献について脅威モデルの謝辞、リリースノート、および OpenClaw セキュリティ殿堂で認識されます。
