# CG-A full結果shape・同JSON文字列bounded検証 記録

Date: 2026-11-03 / 基準HEAD: `b367f37`。

## 1 範囲

[内容gate設計draft-0.3](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_CONTENT_GATE_DESIGN.md)§11の純粋値層を、配布対象外の`tests/support/review/synthetic-recovery-full-json.ts`へ実装した。runtime・公開JSON契約・通常経路は変更しない。

- 固定full schemaの全variantから深さ・配列長・object項目数を導出する。analyze深さ6、集約0.2／0.3深さ8。aggregate decoderは両版の成分別最大を使う。
- 原始文字列のUTF-16長を先に制限し、論理UTF-8長を262,144 byte以下に制限する。同文字列から一度作ったprivate UTF-8 bufferの往復一致を確認し、その内容だけをstrict decodeする。
- `nodes ≤ B`、文字／key費`≤ 3B`、明示lexical費`≤ 16B+128`。full用の枠を既存の局所projection用枠と分離する。
- decoded key重複、壊れた構文、非安全整数、丸めで整数に見える小数／underflow、raw孤立surrogateの置換を拒否する。escaped surrogateは元のUTF-16値を保持する。
- analyzeではreviewed内部のV2 refinementも実行し、aggregateでは既存のfull schema／nested refinementを実行する。正規化値をdeep freezeする。
- 固定理由だけを返し、生JSON・schema issues・例外causeは出力しない。値のbrandは既存のsealed handleと別であり、authorityはnone。

## 2 合成試験

新規93件。独立BFS oracleでshape／decoded統計を確認し、wireのB−1／B／B+1、Unicode、duplicate key、数値、全asset variant、0.2／0.3、counts／rule／release／provenance等のrefinement拒否を検査した。合法な10,000 node超の集約と、旧局所文字費を超えるfull結果も切り捨てず受理した。

REDではhelper未存在、測定関数未存在、strict validator未存在を順に確認した。拡張試験の初回失敗も保持する：大文字列fixtureがnested limitationsとrun limitationsを共有してwire上限を超えていたため、fixture側の配列を分離した。別の大規模fixtureは8,161 nodeしかなく、10,000超の検査条件に未達だったため、100 asset各々へ合法な短いlimitationsを20件追加した。いずれも上限や製品の期限は緩めていない。

## 3 検証結果

| 検証 | 結果 |
| --- | --- |
| 新規単体 | 93件成功 |
| full JSON／finish compare／finish seal／aggregate関連 | 4ファイル・355件成功 |
| 全体合成回帰（maxWorkers=3） | 259ファイル・12,530件成功、失敗0（最終再実行も同数） |
| TypeScript strict単独検査 | 成功 |
| build | 成功 |
| lint | error 0、既存warning 374。変更したTS／梱包試験は個別lint成功 |
| 梱包 | 441ファイル。helper・brand・関数・modelが非同梱。固定import監査、runtime／I/O／clock／worker／漏出のseeded負の対照が成功 |

全体合成回帰では既存のlocalhost待受試験だけを許容し、外部サービスは使わない。通常制限下のprocess一覧取得は環境側で拒否されたが、試験結果JSONと終了結果で完了を確認した。

## 4 レビュー修正（2026-11-03）

§2〜3の93件・12,530件は修正前の記録として残す。レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包441ファイル、全体合成259ファイル／12,530件成功・失敗0を再確認した。

レビューでdecoderの変異を確認し、次の穴を見つけた。`\b`を`b`へ、`\r`を`r`へ誤変換する、または`\f`を不許可にする変異が既存93件をすべて通過した。これらはJSON.stringifyが実際に出力するescapeで、誤変換してもschemaは通るため本文が黙って別の値になる。また`\/`、16進の大文字、指数の`E`、空白のtab／CR／LFを拒否する変異も通過した（RFC 8259上正しい表記の誤拒否で、安全側の失敗）。実装はいずれも正しく復元しており、試験だけの不足である。

- 合成corpusの文字へ`\b`・`\f`・`\r`・`\u001f`を追加し、短いcontrol escape各々の正確な復元を1件追加した。
- JSON.stringifyが出力しない`\/`・`\u00E9`／`\u001F`・`E0`／`e+0`・前後と途中のtab／CR／LFが、元と同一の値へdecodeされることを1件追加した。
- 上記の誤変換・誤拒否の変異10件は、それぞれ追加・拡張した試験だけを失敗させた（指数の`+`を不許可にする変異は既存の指数表記試験も失敗させる）。

末尾の`exact!==String(value)`比較、16桁判定、指数長判定は、safe integer判定と小数部の切捨て判定が先に必ず拒否するため外しても結果が変わらない等価変異として扱う。nodes≤B・lexical_work≤16B+128・UTF-16長の先行拒否も、正しいJSONでは値ごとに1 byte以上を要しUTF-8長がUTF-16長以上であるため到達しない防御判定で、等価変異として扱う。helperは変更せず、新規単体は95件。修正後も全体合成259ファイル／12,532件成功・失敗0。

## 5 未保証・次工程

測定値は論理UTF-8量であり、実IPC受信量ではない。lexical_workは明示したdecoder費だけで、native文字変換・正規表現・Number・schema導出／Zod／freeze・割当のCPU／heap／時間の総上界ではない。全体work／memory受付はUnknownのまま。

受信origin、元analyze本文、context binding、runtime transportは未検証と明示する。純粋関数は反復可能で、capture owner／one-shot claim／取消／jobとの結合はない。任意文字列のschema適合を元本文の証拠へ昇格しない。

次はCG-Bの保護captureと元受理継続、続いてomission／full比較と一度限りgate。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry保留を維持する。実通信・実機操作・設定変更・Push・コミットは行っていない。
