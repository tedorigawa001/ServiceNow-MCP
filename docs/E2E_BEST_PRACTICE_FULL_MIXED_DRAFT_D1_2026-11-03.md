# OB-03 D1：非実行FullMixedDraft・全field比較の合成検証

Date: 2026-11-03 / 基準HEAD: `b17a418`。
Scope: [OB-03設計§10](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB03_DESTINATION_CONTENT_DESIGN.md)のD1のみ。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持し、同pending・ContentChecked・dest／seal・runtimeへ接続しない。

## 1 実装範囲

[値専用module](../tests/support/review/synthetic-full-mixed-draft.ts)は厳密な外側8 fieldと、assets／prefix／traceからなる候補manifestを受ける。元列からの親keep／omit導出は既存OM-Aを利用し、候補assetを別snapshotでstrict構造・reviewed全schema・producer×state検査へ通す。その後、元列の親変換後assetと候補の**全field**、prefix／trace全fieldを比較する。

ID／hash／同objectだけの一致で短絡せず、配列順序・重複・optional fieldの有無を保存する。object keyの挿入順は意味比較に影響させない。元reviewedの全本文は親省略後もoriginal_rowsに保持し、元worker omittedと交換しない。

選択は1〜100、retained not_processedを最低1行必要とする。OM-Aの元列局所枠と各assetの262,144 bytes等を維持し、候補も個別bounded snapshotする。D1の103件の中間prefix比較成功はRA／PD-A eligibilityの受理を意味しない。実active input／時刻・row／input receipt・originは未検証のまま。

戻り値はauthority:none、full_mixed_values_only、freeze済みの元列・manifest・保持findings数と部分的usageだけ。caller aliasを保持・freezeせず、失敗は固定reason／phaseのみ。owner・claim・失効・ContentChecked証拠は生成しない。

## 2 独立oracleと試験

[合成試験](../tests/review/synthetic-full-mixed-draft.test.ts)は期待値生成にOM-A／PD-A／本比較器を使用しない。残findings枠の逐次減算、線形のwarning既出確認、固定error残枠、全assetの独立DATA copyでmanifestとtraceを作る。

0.2／0.3 × findings列5条件 × 元errors0／99／100 × 初期warning4条件の**120組**を含む49件を確認した。oracleの定義は実装のSet＋sort処理を複製するものではない。

| 群 | 確認内容 |
| --- | --- |
| 全本文 | issue／impact／applicability／recommendation、source summary、targetのnullable field・code hash、reviewed_at等のschema適合変更をcontent不一致として拒否 |
| 順序と重複 | findings順序・重複への置換、follow-up順序、limitations順序、Unicode正規化の差を拒否。object key挿入順だけの差は許可 |
| 親変換 | 99 keep→2 omit→1 keep等、worker omitted、親省略の元body保持、traceのaction／incoming／追加warningとprefix error順序を照合 |
| 分類 | 親omitted↔元worker omitted、元body欠落、非reviewed余分field／reason／state、retained順序変更を拒否 |
| ゼロと集合 | 元reviewed0件のmetadata＋retained、空列拒否、retainedなし拒否、ID重複／選択順不正を確認。現subsetで到達しない「親省略だけで出力reviewed0」を捏造しない |
| 版 | ruleset pinと元／候補reviewedの版、未知版拒否、0.3削除行拒否、producerとreasonの不適合を確認 |
| 上限 | 100行成功／101行拒否、OM-Aの中間prefix103を値として保持、per-asset bytes超過・文字／depth・sparse／symbol等を拒否 |
| 秘密非出力 | proxy／accessorを実行せず拒否し、Errorにraw本文・causeを保持しない。追加引数も拒否 |
| 非authority | 元DATAと候補を両方同じ本文へ変更した場合は値一致し得るが、row_receipts／original_wireはunverifiedのまま。入力の真実性・実originを証明しない |

検査はguardや製品のcatch内でassertせず、呼出しの外で行う。

## 3 全field比較の負の対照

full assetの深い比較だけを一時的に外し、schema検査・ID・contextが同じrecommendation変更の試験を実行した。**1件失敗・48件skip**となり、schema適合だけでは変更を検出できない状態を試験が検出した。

比較を復元して再実行し、最終回帰は成功。通常実装での予期しない初回失敗は観測していない。最初の47件、境界／非authority追加後の49件、strict単独型検査も成功した。期限・既存cap・実動作を緩めていない。

## 4 最終確認

- `bdo npm run build`：成功（製品src）。
- `bdo npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck tests/review/synthetic-full-mixed-draft.test.ts`：成功（新試験／helperと依存）。
- `bdo npx vitest run tests/review/synthetic-*.test.ts`：**44ファイル・3,503件成功**。既存3,454件とD1の49件を含む。
- `bdo node tests/review/package-http-classification.mjs`：**成功、441ファイル**。新moduleの固定pure依存・漏出／I/O／clock／workerの負の対照、kernel未接続・配布除外と既存compiled試験を確認。
- `bdo git diff --check`：成功。

D1専用compiled実行fixture・全機能の全体回帰は未追加／未実行。実接続・実通信・実機操作・設定変更・Pushは行っていない。

## 5 レビュー修正（2026-11-03）

本記録の新規試験件数は修正前の記録として残す。レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査（441ファイル）、全体合成279ファイル／13,682件成功・失敗0を確認した。

D1 helperの14変異を確認し、次の4判定は外しても既存試験が全て通過した。実装は正しく、試験だけの不足である。

- 候補assets数と選択数の一致。比較は候補assetsの範囲だけを走るため、判定を外すと末尾assetを落とした候補が受理された。1件を追加した。
- 深い比較の配列長。元列側を基準に走査するため、判定を外すと候補側の追記（findings、prefixのlimitations／errors、traceの行）を見逃した。既存の順序・重複試験は同じ長さの置換だった。4件を追加した。
- 深い比較のkey数。assetはstrict schemaが余分fieldを拒否するが、prefix／traceはschemaを通らないcopyのみで、末尾に整列する余分keyを見逃した。trace・prefixの各1件を追加した。
- 元列reviewedのruleset照合。外しても候補側照合（manifest）が拒否するが、既存試験はphaseを見ていなかった。parent phaseを固定する1件を追加した。

上記4変異はそれぞれ追加した試験だけを失敗させた。空rows判定（OM-Aが先に拒否）、候補のper-asset bytes判定（元列と同じ上限を通過済みの値との全field一致が必要で、変わるのは不一致時のreasonのみ）、非reviewedのproducer検査、reviewed full schemaの再parse（元列検査と全field比較で代替）、候補reviewedのruleset照合（元列照合が先に拒否）、primitive比較の`===`→`==`（許可する値型で差が出ない）は等価変異として扱う。helperは変更せず、新規試験は8件増。修正後も全体合成279ファイル／13,690件成功・失敗0。

## 6 残課題と限界

D2の同pending由来検査・private ContentChecked／未公開dest・一度限り準備、D3 atomic commit／同期失効、D4正常終端は未実装。今回の非実行draftをこれらの証拠へ昇格させない。

元列／候補の各snapshotには有限上限があるが、schema検査・JSON serialization・copyピーク・全work／heap・3round配賦・中断粒度はUnknown。usageの部分計数を本番受付に使わず、既存小型expectationへfull本文を詰める枠拡張もしない。実worker wireの真正性や本文の業務的正しさは今回の比較保証外である。
