# NR-A strict非reviewed値・producer純粋検査 記録

Date: 2026-11-03 / 基準HEAD: `84c3461`。

## 1 実装範囲

[非reviewed設計draft-0.2](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_NONREVIEWED_DESIGN.md)§9のpure値層を、配布対象外の`tests/support/review/synthetic-recovery-nonreviewed-values.ts`へ実装した。既存runtimeのソース、CG-B／BP1の受付、公開JSON契約は変更していない。

- strictなschema_version／producer／outcomeと、parent_omissionだけのoriginal_state:reviewedを検査する。
- metadata／retrieval／analysisのstate・reason組合せを制限し、元worker omitted・親省略draft・retained deadlineを別category／型として返す。親省略draftは元captureや合法な変換の証明ではない。
- 0.3のdeleted、retrievalのunauthorized、未対応のnot_processed理由、不正field、未知reasonを拒否する。原始値・array・getter／Proxy・特殊prototype・symbol key等も拒否する。
- 深さ2／key4／node16／UTF-16文字費1024の1値枠をcopyと同時に検査し、独立usageを返す。入力をfreezeせず、正規化copyを深くfreezeする。
- scopeはsynthetic_nonreviewed_values、authorityはnone。producer／receipt／decision／元capture／cleanup／manifest／runtime transportは未検証。issuer・owner・one-shot claimや時計・I/Oを持たない。

## 2 RED／GREENと独立oracle

helper未存在のimport失敗をREDで確認し、analysisのrejectedをimmutable DATAとして扱う経路をGREENにした。続いて全producer／state／reasonの独立表、variant field、parent draft、上限、統計、型分離の対照を追加した。

独立表はhelperのcontractから生成せず、6 producer（unknown含む）×8 state×42 reason×2 versionの4,032組を照合した。さらに固定payload-review／update-xmlソースをTypeScriptでtranspileし、Acorn ASTからreject／ExtractionErrorの文字列理由を収集して、asset schemaに載るdeliverable analysis理由の26件と照合した。テキストを解析するだけで、対象JSを実行していない。

ソースのinvalid_result_contextは現asset rejected enumに存在しない。workerのasset parseが失敗するケースなので、NR-Aでも受理せず、公開schemaや本体実装を変更しなかった。schema-only unauthorizedを許可しない対照も実行した。

## 3 検証結果

| 検証 | 結果 |
| --- | --- |
| NR-A新規 | 60件成功 |
| NR-A／CG-BP1／CG-B／RD-B04／CG-A／RD-B03関連 | 6ファイル・510件成功 |
| 全体合成回帰 | 262ファイル・12,715件成功、失敗0・pending 0 |
| build | 成功 |
| 新試験／helperのstrict TypeScript検査 | 成功 |
| 変更TS・梱包試験のESLint | 問題なし |
| 梱包 | 441ファイル。helper・型／関数・scope／brandが非同梱。固定import監査とruntime／I/O／clock／worker／漏出のseeded負の対照成功 |

文字費は1024 capに対し3の倍数で計上するため、1023でschema段階へ進み1026ではlimit拒否する境界を検査した。深さ・node・key上限、getter／Proxy trap実行0、入力の後書換えとcaller freeze副作用なし、固定errorだけを保持することも確認した。全体回帰では既存localhost合成待受試験だけを許可し、外部サービスを使っていない。

## 4 レビュー修正（2026-11-03）

§3の60件・12,715件は修正前の記録として残す。レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包、全体合成262ファイル／12,715件成功・失敗0を再確認した。

レビューでpure値層の25変異を確認し、次の3判定は外しても既存60件がすべて通過した。実装は正しく、試験だけの不足である。

- 特殊prototypeの拒否。既存試験の`Object.create({producer:'analysis'})`はown keyを持たず、schemaで必ず失敗していた。正当なown dataを持つclass instance（root）とDate.prototype由来object（outcome）を拒否する1件を追加した。判定を外すとnull-prototype copyへ移されて受理される。
- symbol keyの拒否。既存試験のsymbol値は数値で、値のcopyで失敗していた。値が文字列のsymbol keyをroot／outcomeで拒否する1件を追加した。判定を外すと受理され、文字費がNaNになって以後の文字費上限も効かなくなる。
- node上限の境界。21 nodeだけを検査していたため、`>=`→`>`が通過した。16 nodeはschema段階へ進み、17 node目で`limit`になる1件を追加した。

上記3変異はそれぞれ追加した試験だけを失敗させた。analysis理由snapshotの撤去（現rejected enum全26件と一致）、文字費の`>`→`>=`（計上は3の倍数で1024ちょうどにならない）、配列判定（`length`が数値で必ず拒否）、accessor判定（valueがundefinedで必ず拒否）、catch変換（対象例外が発生しない）は等価変異として扱う。helperは変更せず、新規試験は63件。修正後も全体合成262ファイル／12,718件成功・失敗0。

[RDC設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_JOB_RDC_DESIGN.md)の非reviewed設計リンクから古いdraft表記を外し、[SRD設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_SRD_DESIGN.md)のStatusを内容gate draft-0.8へ揃えた（表記のみで版数は変更しない）。

## 5 未保証と残課題

NR-Aはcallerが渡した値の形状・組合せだけを検査する。metadata分類が実際に起きたこと、同attempt／jobから来たこと、停止がsoftだったこと、元reviewed captureが存在することは証明しない。producerやoriginal_stateの正しい文字列から証拠へ昇格するAPIはない。元JSON文字列の検証・実受信量の保証でもない。

局所usageはnative列挙・copy・Zod正規化・freezeの総CPU／heap上界や期限内中断保証ではない。全体work／memoryはUnknownで、元C/G/P会計へ加算・承認していない。NR-Bの発行元／同receipt／one-shot、NR-Cの混合集合／ゼロcapture、合法omission・finish job／full gateは後続に残す。

証拠発行は行わず、正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。実接続・実通信・実機操作・設定変更・本番cap／Permit／候補発行・Push・本作業のコミットは行っていない。
