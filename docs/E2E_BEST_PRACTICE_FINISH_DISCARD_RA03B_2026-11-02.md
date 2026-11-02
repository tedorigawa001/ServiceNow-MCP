# RA-03-B accepted固定discard・終端責務の消費 合成検証

Date: 2026-11-02。Baseline: `a0a4c6c`。対象は配布対象外の合成kernel／facadeのみ。

## 1 実装範囲

`discardAcceptedFinishContext(binding, accepted)`を同kernelへ追加した。元owner／busy／hardの検査後、discard開始claimを外部guard前に占有し、同accepted終端slot・source完了受領情報・新frame cleanup完了受領情報をまとめて局所pendingへ移す。期待値も破棄し、失敗でも元slotへ返さない。post guard後だけ成功discard履歴を1へ更新する。返却はundefinedで、能力や再利用可能なsummaryは返さない。

source完了は同source identityの開始・closed受理とpost guard後commitからだけ記録する。cleanup完了は同frame／cleanup identity／sinkと開始済み・confirmedの健康な固定継続からだけ記録する。受領情報は同じimmutable accepted終端slotへのprivate参照で結合する。callerのbool・公開診断・旧世代のcomplete・hard後のconfirmedで代替しない。

同sourceと新frameの解放順はどちらでもよい。両完了受領情報と同acceptedがそろう固定discardの後だけ、既存normal closeが成功する。未確認の場合は再待機や実cleanupを開始せず停止する。元UTC・pinの破棄は既存close規則を使い、会計prefix・旧closure診断は変更しない。

## 2 REDからGREEN

最初の連続正常系1件は、新しい`finish_accepted_discard`診断・完了受領情報が存在しないため失敗した。private受領情報・開始claim・固定discardとfacadeを追加して成功した。以後、境界ケースを順に追加した。RA-03-A試験の「discard method不在」の期待だけを今回の承認済みAPIに合わせて更新し、秘密非露出とdiscardを通さないnormal close拒否は維持した。製品・試験期限は変更していない。

## 3 確認した条件

- 発行→受理→同source／新frameの解放→一度限りdiscard→normal closeの連続合成経路。
- source先行／cleanup先行、同sourceのpost guard後だけ受領情報を公開する順序。
- 片側のみ・開始だけ・未開始・旧世代だけの確認では成功しない。
- 同accepted・終端slot・二つの完了受領情報をguard前に一括消費。guard中は終端pendingとconfirmedがfalse、discardsはcommitまで0。
- 別root／copy／別binding／発行証拠／旧handoff／plan／ready／診断／raw値／getter／Proxyを拒否。他rootは不変、caller accessorは実行しない。
- 発行のみで未受理の値、追加raw proof・bool相当の値・callbackを受けない。
- 二重discard、両guardの取消／期限切れ、吞み込まれた再入、未知例外で部分commitしない。post guard理由をidentity不一致より優先する。
- source失敗／未確認とcleanup失敗／未確認を別軸で保持。hard後のcleanup診断confirmedから完了受領情報を作らない。
- 同frameのcleanup開始を省略したrecord、別rootのsinkを拒否する。
- 元会計prefix・旧closure事実・固定7種類のworker起源を維持する。
- 公開診断へID／UTC／frame／snapshotを出さず、legacy／lifecycle専用rootのAPI・診断field・phase型も維持する。

## 4 最終検証

| 検査 | 結果 |
| --- | --- |
| 新規`synthetic-finish-discard.test.ts` | 64件成功 |
| 関連8ファイル | 621件成功、失敗0 |
| 全体Vitest（maxWorkers=3） | 254ファイル・12,050件成功、失敗0・skip0、約35.1秒 |
| `npm run build` | 成功 |
| 新discard・既存accept／issue試験を入口にしたstrict TypeScript検査 | 成功 |
| 変更5コード／試験ファイルのESLint | 指摘0 |
| `node tests/review/package-http-classification.mjs` | 成功、441ファイル |

全体試験はローカル待受可能な条件で実行した。外部サービス／PDIへの通信・実worker運用を確認する試験ではない。梱包では新試験・discard API名・private受領情報名の非同梱と、共通kernelの固定依存・I/O／clock／worker混入の負の対照を確認した。

## 5 残課題・維持条件

finish jobへの期待値封印、E／finish応答／候補、候補消費用SourceClosed／NewCleanupConfirmed、元analyze受理capture・実結果の由来は未実装。今回の完了受領情報はaccepted固定discard専用であり、RD-Dの正常終端能力を発行したものではない。

現在の公開合成sourceはverify=null。実verify・実session／ReleasePermit／workerの真正性は未検証。完了受領情報の保持・消費・guard／診断／破棄の追加work／allocation・exact layout・全体上界はUnknownであり、prefix不変を追加費用0とはしない。

正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持。実接続・実通信・設定変更・Pushは行っていない。

設計: [発行・RA-03受理接続差分draft-0.4 §11](BEST_PRACTICE_ABORT_SCOPE_FINISH_ISSUE_ACCEPT_DESIGN.md)。
