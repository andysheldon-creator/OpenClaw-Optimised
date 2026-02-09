# 25. المساهمة في نموذج تهديدات OpenClaw

26. شكراً لمساعدتك في جعل OpenClaw أكثر أماناً. 27. نموذج التهديد هذا وثيقة حيّة ونرحب بالمساهمات من أي شخص — لا تحتاج لأن تكون خبيراً أمنياً.

## 28. طرق المساهمة

### 29. إضافة تهديد

30. هل لاحظت متجه هجوم أو خطراً لم نقم بتغطيته؟ 31. افتح مشكلة على [openclaw/trust](https://github.com/openclaw/trust/issues) ووصفها بكلماتك الخاصة. 32. لا تحتاج إلى معرفة أي أطر عمل أو ملء كل حقل — فقط صف السيناريو.

33. **مفيد تضمينه (لكن غير مطلوب):**

- 34. سيناريو الهجوم وكيف يمكن استغلاله
- 35. أي أجزاء من OpenClaw متأثرة (CLI، البوابة، القنوات، ClawHub، خوادم MCP، إلخ.)
- 36. مدى شدته برأيك (منخفض / متوسط / مرتفع / حرج)
- 37. أي روابط لأبحاث ذات صلة أو CVEs أو أمثلة من العالم الحقيقي

38. سنتولى مطابقة ATLAS ومعرّفات التهديد وتقييم المخاطر أثناء المراجعة. 39. إذا رغبت في تضمين تلك التفاصيل، فهذا رائع — لكنه غير متوقع.

> 40. **هذا مخصّص للإضافة إلى نموذج التهديد، وليس للإبلاغ عن ثغرات حية.** إذا عثرت على ثغرة قابلة للاستغلال، راجع [صفحة الثقة](https://trust.openclaw.ai) لدينا للحصول على إرشادات الإفصاح المسؤول.

### 41. اقترح إجراء تخفيف

42. هل لديك فكرة لمعالجة تهديد قائم؟ 43. افتح مشكلة أو طلب سحب (PR) مع الإشارة إلى التهديد. 44. إجراءات التخفيف المفيدة تكون محددة وقابلة للتنفيذ — على سبيل المثال، "تحديد معدل لكل مُرسِل بواقع 10 رسائل/دقيقة عند البوابة" أفضل من "تطبيق تحديد المعدل".

### 45. اقترح سلسلة هجوم

46. تُظهر سلاسل الهجوم كيف تتكامل عدة تهديدات لتشكّل سيناريو هجوم واقعي. 47. إذا رأيت توليفة خطيرة، صف الخطوات وكيف سيقوم المهاجم بربطها معاً. 48. سردٌ قصير لكيفية تطور الهجوم عملياً أكثر قيمة من قالب رسمي.

### 49. إصلاح أو تحسين المحتوى الحالي

50. أخطاء مطبعية، توضيحات، معلومات قديمة، أمثلة أفضل — نرحب بطلبات السحب، ولا حاجة لفتح مشكلة.

## What We Use

### MITRE ATLAS

This threat model is built on [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems), a framework designed specifically for AI/ML threats like prompt injection, tool misuse, and agent exploitation. You don't need to know ATLAS to contribute - we map submissions to the framework during review.

### Threat IDs

Each threat gets an ID like `T-EXEC-003`. The categories are:

| الشيفرة | الفئة                                      |
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

- [ATLAS Website](https://atlas.mitre.org/)
- [ATLAS Techniques](https://atlas.mitre.org/techniques/)
- [ATLAS Case Studies](https://atlas.mitre.org/studies/)
- [OpenClaw Threat Model](./THREAT-MODEL-ATLAS.md)

## Contact

- **Security vulnerabilities:** See our [Trust page](https://trust.openclaw.ai) for reporting instructions
- **Threat model questions:** Open an issue on [openclaw/trust](https://github.com/openclaw/trust/issues)
- **General chat:** Discord #security channel

## Recognition

Contributors to the threat model are recognized in the threat model acknowledgments, release notes, and the OpenClaw security hall of fame for significant contributions.
