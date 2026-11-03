# PD-B(A)：固定入力化・配列比較の値専用合成検証

Date: 2026-11-03 / 基準HEAD: `2043665`。
Scope: [接続差分設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_PENDING_PREFIX_BINDING_DESIGN.md)の(A)のみ。同pendingへの接続・関係値発行・seal成功は行わず、正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。

## 1 変更範囲

- package除外の`synthetic-pending-prefix-values.ts`に値専用selector／比較器を追加。厳密な外側DATAとmodel viewから固定PD-A入力を作り、PD-Aを1回呼ぶ。同pins／acceptedを名乗るDATAのprefixを比較するが、実owner／receipt由来とはみなさない。
- verifyは6 own DATA項目だけを選ぶ。headersも版・collection.status・limitations・errorsだけを選び、accounting／principal等の対象外accessorは実行しない。これは対象外項目の正しさを保証しない。
- 選択値をnodes 8,000／文字課金1,950,000／depth 6／keys 8／array 103で共有copyし、その後もPD-Aの既存枠を維持。比較対象headerが103超ならinputで先行拒否する。
- base／canonicalの配列を全順序・重複・optional sys_idの有無まで比較。比較時sort／dedup・errors切詰めの救済を追加しない。
- 戻り値はfreeze済み値とsnapshot使用量・`authority:none`のみ。関係値claim・guard・clock・失効・I/O・kernel接続を追加していない。`synthetic-recovery-kernel.ts`の変更はない。

## 2 独立oracleと負の対照

新試験はPD-A／OM-A／plan投影をimportせず、線形既出確認・明示UTF-16挿入順・逐次のerror残枠処理で期待値を作る。0.2／0.3 × 3 consistency × 親warning件数10条件 × errors4条件 × X既出2条件の**480組**を比較／拒否する。changed＋verify errorのpure-only組も含み、実creatorが発行可能という保証とは区別する。

| 群 | 確認内容 |
| --- | --- |
| 固定入力化 | verifyにaccounting／attemptsがあっても選択6項目だけをPD-Aへ供給。callerをfreezeせず、後の変更は出力へ反映しない |
| lane比較 | base／acceptedの順序・model／headerの版・collection・error値／順序／重複／未知field・optional IDの増減・seed誤採用を拒否 |
| 境界 | warning 100／101／102／103、長さ200／201、error98／99／100・drop・X、配列104、node／文字総量・depth／keys、sparse／cycle等を拒否 |
| 版と理由 | candidate filterの0.2／0.3・collection・ID制約、PD-A eligibility等の元phaseを固定`delta_phase`として保持 |
| 安全な選択 | 対象proxy／accessorを拒否し、無関係なheader／verify accessorも実行しない。raw例外・cause・入力本文を失敗に保持しない |
| 非保証 | 異なるtarget等の対象外fieldは比較せず、full_header／accepted_originをunverifiedに残す |

負の対照としてlimitationsの順序比較を一時的に外した。`seeded accepted_order`が**1件失敗・34件skip**となり、呼出し外のassertionで検出した。変更を戻した後、当時の新規35件は成功。最終版は理由保持・非保証の1件を追加して36件。

## 3 初回失敗と修正

初回は33件中2件失敗・31件成功。oracleが構成した比較対象Hのwarning数が104／105等になり、PD-Aに到達する前に新snapshotのarray103枠でinput拒否された一方、試験がdelta拒否を期待していた。上限を緩めず、H自体が103超の場合はinput先行拒否とする期待へ訂正し、33件成功を確認した。許容されるroot入力や期限の変更はない。

さらに独立したTypeScript検査では、配列判定後のl／eがunknownのままとなる2エラーを検出。拒否分岐を`return bad(...)`に明示して型を絞り込んだ。実行時条件は同じであり、helperと新試験のstrict単独型検査を再実行して成功した。

## 4 最終実行結果

- `bdo npm run build`：成功（製品src）。
- `bdo npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck tests/support/review/synthetic-pending-prefix-values.ts tests/review/synthetic-pending-prefix-values.test.ts`：成功（新helper／試験とその依存）。
- `bdo npx vitest run tests/review/synthetic-*.test.ts`：**42ファイル・3,439件成功**。新値専用試験36件を含む。
- `bdo node tests/review/package-http-classification.mjs`：**成功、441ファイル**。新moduleの固定import・I/O／clock／worker漏出の負の対照、配布除外、kernel未接続、既存compiled fixtureを確認。
- `bdo git diff --check`：成功。

新helper専用のcompiled実行fixtureや全機能の全体回帰は未追加／未実行。実接続・実通信・設定変更・Pushは行っていない。

## 5 レビュー修正（2026-11-03）

本記録の新規試験件数は修正前の記録として残す。後続のPD-B(B)接続（`b3ceea7`）と合わせ、レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査、全体合成278ファイル／13,629件成功・失敗0を確認した。

PD-B(A)値層とPD-B(B)接続の20変異を確認し、次の2判定は外しても既存試験が全て通過した。実装は正しく、試験だけの不足である。

- error recordの`update_xml_sys_id`値の不一致。期待側にIDがあり実値も同keyを持つが値が異なる場合、`has&&field(a,'update_xml_sys_id')!==b.update_xml_sys_id`が唯一の検出点だった。既存の`optional_id`試験はkeyの追加／削除で、key集合の判定が先に拒否していた。pins header側・accepted header側の各1件を追加した。
- 未知`kind`の拒否。判定を外しても全試験が通過した。1件を追加した。

上記2変異はそれぞれ追加した試験だけを失敗させた。PD-B(B)の重複claim判定（`transferStarted`と同時に設定）、post後の候補identity再照合（常に同値）、post時の候補・header・budget有無の判定（候補欠落時は先に`mismatch`が立つ）、`isCleared`の候補条件（`clear()`が常に実行）は等価変異として扱う。helperは変更せず、新規試験は3件増。修正後も全体合成278ファイル／13,632件成功・失敗0。

## 6 次工程

(B)で同pendingが保持するPp／model版・同plan verify・実header受領物から固定DATA viewを供給し、同identity・開始claim・pre/post・暫定候補を接続する。(C)のpost受理・一度限り関係値消費・全破棄・compiled保証も未実装。全work／heap・3round配賦・元trace／runtime provenanceはUnknownであり、今回の値一致をそれらの証拠へ昇格させない。
