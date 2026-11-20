# AP05 G02：ED01〜07の個別処遇案・承認票

Version: release-ap05-g02-ed-individual-disposition-approval-draft-0.2 / Date: 2026-11-20。

Status: **審査案のみ。ED01〜07の個別処遇は全件未選択、個別承認は全件未承認。G02は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準 `8bf7fb5` とAP03採用記録の `53eff59` は文書根拠であり、製品候補ではない。

draft-0.2のレビュー修正：レビュー修正の基準HEADは`781c9b6`（修正時のHEADは`32a24ae`）。本書の後に追加された横断審査表とED01〜07の回復先行案へ、本書から到達できなかったため、§3の記入欄の後に横断審査表への参照を加えた（各回復先行案へは同表の§2から参照する）。各票の処遇・承認欄と審査順は変更していない。

[G02旧assertion・回復条件](BEST_PRACTICE_RELEASE_AP05_G02_OLD_ASSERTION_RECOVERY_DESIGN.md)の7行を、[AP01残差台帳](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)のA1-I02／P01〜10に結び、処遇の比較と一件ずつ採否を決めるための欄を設ける。[G01照合表 draft-0.4](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)の採用方針は入力・型／import境界の根拠に限り、切る／残す辺の未確認、旧保証の未代替、実行許可を埋めない。旧caseの正規分類は7件とも未対応のまま。

通常経路・旧試験と期待値・故障位置・既存fixtureを維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 処遇の選び方

- **維持案**：対象の旧保証を引き続き要求し、元の観測位置・期待値・故障条件を変えない。現在の旧試験（H）の保持は全案共通。その保持を根拠に、候補配布物（P）でも当該保証が維持されたとは言わない。維持にPでの旧friend存続が必要なら、それを配布して通すのではなく候補を止める。
- **回復先行案**：未代替保証を残差として保持し、元位置・同一性・結果を判別できる正負対照と、必要なcompiled／配布物・終了確認を別承認で揃え、個別再審査まで処遇を確定しない。Pの通常経路維持はどの案でも必須。Pでの不在や開発側（D）の値／別root対照は、元保証の回復とは別欄に置く。
- **非提供案**：限定公開で提供しない旧専用経路と、失われ得る旧保証を一件ずつ明示し、責務先・外部説明・将来の回復条件を付けて個別承認を求める。通常K、旧試験、共有責務、外部影響のUnknownは除外・弱化しない。分離不能・許容できない影響・責務先不明なら受容不可として停止し、別案へ自動移行しない。

## 2 ED01〜07の個別審査

| ED／旧case・根拠 | 維持案：残す直接観測 | 回復先行案：未代替と再審査条件 | 非提供案：切り出せる範囲・除外 | 責務先と今回の審査順（案） |
|---|---|---|---|---|
| ED01／SA-25・A1-X01 | 通常生成した実sessionへの推測keyでclaim=false、creation付きsourceの同期 `invalid_input` を含むthrow、capture未呼出し、requests=0 | 同実classのclaim／constructor位置で4点を判別。候補の通常2引数・許容されるJS明示undefined・初期結合／通常Permitを別の正対照にする。DR-20、型エラー、requests=0だけで代替しない | 旧外部status consumer／creationの採用経路と元位置での拒否保証だけを非提供候補とする。通常source・`claimStatusBinding`・会計・Permitを除外できなければ受容不可 | source／session owner、AP02 S02とAP03 C07／C06、AP05 H。初期結合を先に保護し、ED04／05と同時照合するが承認票は独立 |
| ED02／SA-26・A1-X02 | SA wrapperを先に読み込んだ後のclass own名不在と、同SA slotの再取得時の同期throw。初回取得を直接assertした扱いにせず、HのFX04のcode検査は保持 | 同じSA slot・import順で旧2点を分離し、Pでは通常classの正常loadと、SAの旧named／namespace／専用wrapper・登録／runnerの不在を独立確認。不在で再取得拒否を回復したとはしない | 旧SA取得・登録・runnerと再取得拒否保証を非提供候補にできるのは、通常factory／close／lifecycleに依存がないと説明できる場合だけ。SAの結果でNDを扱わない | SA slot／wrapper ownerと配布審査、AP02 S01／06、AP05 FX04／PK02。分離が示せれば非提供案を先に審査、未証明なら停止 |
| ED03／ND-30・A1-X03 | ND wrapperの先行import後のclass own名不在とND固有slotの再取得時の同期throw。HのFX03の正規表現検査はSAのcode検査へ揃えない | ND固有のslot・import順・元2点を保持。Pでは通常loadを正対照に、ND driver／登録／runnerと旧名・専用wrapperを独立確認。Dのnative連続やSAの証拠は流用しない | 旧ND friend取得から専用driverへの経路と再取得拒否保証に限定。通常lifecycle、共有診断・resource所有／無bridge、B-03／UN62を非提供に含めない | ND slot／driver／wrapper owner・配布審査、B-03の共有責務、AP05 FX03／PK02。共有診断・回収の境界を先に確認し、非提供案は条件成立後に別審査 |
| ED04／ACK-34・N2-X07 | creation内keyのobject／undefined／nullでclaim=false・同期 `invalid_input`、capture未呼出し、拒否後の同sessionの `chargePayload('x')` 後にpayload=1 | 3入力・元拒否位置・同sessionの後続計上を一組で判別し、PでJSの直接new／転送・第3値そのものが明示undefinedの場合を別対照。payload=1を全状態不変としない | 非提供候補は旧creation／私有claimとその元位置での拒否のみ。同sessionの通常会計・正規source／Permit・拒否後の既存session利用は対象外。判別できなければ受容不可 | source／session・canonical accounting owner、AP02 S02、AP03 C07／C06、AP05旧ACK。通常会計を守る確認を先行 |
| ED05／ACK-35・N2-X08 | テストが成功を返すstatic verifierを設置しても旧creationが同期 `invalid_input`、capture未呼出し。設置名を現行APIとせず、設置関数の呼出し数は追加しない | 同注入位置・拒否・captureを保持し、Pの通常初期source／ownerが実参照で結合すること、外部の成功値で代替できないこと、旧採用口の再露出・別名不在を独立に確認 | 元の外部verifier注入を使った旧creation境界の保証に限る。通常の実照合を弱めたり、公開verifierや新friendで代用したりする案は受容不可 | 固定rootのsource／session owner、AP02 S02、AP03 C06／C07。ED06とは注入位置・未代替保証を分け、通常照合の根拠を先に審査 |
| ED06／ACK-36・N2-R11 | `bindReviewReleaseSource` をno-opにしたsynthetic runのPromiseが `code: internal_review_error` で拒否。cleanup完了・副作用数・内部停止理由は元assertionに追加しない | 後段の同faultとPromise拒否をHで保持し、Pの通常matched経路で同source／Permit／port／登録owner・readyの実結合と、結合欠失時は進まないことを独立に確認。案Pの同期 `invalid_input`、Dのunknown／withheld、他FX05の成功は非同等 | 旧synthetic後段の返却・故障検出だけを非提供候補にする。通常bindの実結合や停止／rollback／closeに影響がないこと、旧Promise利用者への結果差の扱いが示せなければ受容不可 | session／source／Permit／port／登録ready owner、AP02 S03／05／07、AP04、AP05旧fault。最優先で回復先行案を審査する（処遇は未選択）。候補の入口拒否で後段保証を処理済みにしない |
| ED07／CR04・N5-C04 | 実sourceの推測key付きconstructorが同期 `invalid_input`、capture／`observeReleaseUtc`／`acceptReleaseObservation` がすべて未呼出し | 元位置で3 callback非実行と拒否を判別し、Pで外部観測hook非採用と通常の実観測日時・pin済みpolicy・legacy判定・停止を別確認。固定OやDのschema拒否を同時刻位置の代替にしない | 旧外部観測receiverとその元位置での検査に限定。通常観測・時計／policy・共有stop／解放を切らない。候補で分離不明なら回復先行または停止 | 同source／sessionの観測・receipt owner、AP02 S02／04／07、AP03 C07／C06、NS05／AP05。共有writer・解放の境界確認を先行 |

審査順は実行順でも処遇の選択でもない。先にED06の後段実結合、ED04／05／01の既存session・通常初期結合、ED07の通常観測への影響を確認し、ED02／03は独立した専用閉包の分離可否を別々に検討する。出力・時刻・会計・診断・終了の観測を別軸で扱い、通常KがUnknownなら非提供案を先に確定しない。

## 3 個別承認票（案・全件未記入）

1旧caseにつき1票とし、同一の章・fixture・共有ownerを参照しても票を束ねない。票のキーは既存ED／正規旧caseで、新しいruntime IDや権限を発行しない。「未記入」は未承認を意味し、合意なしの推奨順・旧試験保持・ドキュメントのコミットを決裁に数えない。

| 票／旧case | この票で選ぶ対象と必要な独立確認 | 処遇の選択（A1-P07） | 承認（A1-P09） |
|---|---|---|---|
| ED01／SA-25 | 旧status consumer拒否。元4観測と通常source／Permitの正対照 | 未選択 | 未承認・未記入 |
| ED02／SA-26 | SA再取得拒否＋class非露出。FX04／SA固有の不在と通常load | 未選択 | 未承認・未記入 |
| ED03／ND-30 | ND再取得拒否＋class非露出。FX03／ND固有の不在・共有責務 | 未選択 | 未承認・未記入 |
| ED04／ACK-34 | 3 key variant・同session後続会計。creation内keyと第3値の差 | 未選択 | 未承認・未記入 |
| ED05／ACK-35 | 成功風static非採用・元capture未呼出しと通常の同owner実照合 | 未選択 | 未承認・未記入 |
| ED06／ACK-36 | no-op bind後の旧Promise拒否と通常の実bind／欠失対照。AP04結果差 | 未選択 | 未承認・未記入 |
| ED07／CR04 | 元constructorで3 hook非実行と、通常観測／legacy判断の維持 | 未選択 | 未承認・未記入 |

各票を審査に渡す際の記入欄：

| AP01の欄 | 各票に記入する内容・現時点の境界 |
|---|---|
| A1-P01〜04：識別・維持・喪失・残差 | 旧revision／元case・入力variant・注入／停止位置・直接assertion・元artifact、通常Kと影響しない根拠、候補の対象範囲、代替根拠との差。候補の対象revision／digest・実行証拠は未記入 |
| A1-P05〜06：所有・回復 | §2の役割を基に引受担当、診断／停止／失効／未確認cleanupの保持先、同位置・同一性・正負対照・compiled／配布物・終了確認、再レビュー条件。人の担当・期限、観測や保全の方式・保全先・数値は未承認／未確定 |
| A1-P07〜08：処遇と受容条件 | 維持／回復先行／非提供の個別審査／受容不可・停止のいずれか。非提供案を選ぶ場合は外部説明案・未代替保証・通常Kと許容しない影響・将来回復条件を明示。理由・選択・受容はいずれも未記入 |
| A1-P09〜10：決裁・他の承認 | 承認者・承認日・採否と根拠・対象revision／assertion・除外条件・他の許可への参照。個別処遇は未承認。AP02実装、AP05候補検証、AP05旧試験切替、AP04の結果差、AP06公開は別判断 |

7票へ渡す共通正対照・各票固有の不足は[ED01〜07回復先行案の横断審査表](BEST_PRACTICE_RELEASE_AP05_G02_ED_RECOVERY_CROSS_REVIEW_DESIGN.md)で整理し、各EDの回復先行案は同表§2から参照する。同表は処遇の選択・承認ではなく、上の欄を埋めない。

## 4 G02への受渡しと停止条件

- [候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)へ渡すのは各票の処遇、旧試験を残した検証範囲、通常経路を維持する根拠、未代替項目と引受先、当該段階の承認。必要な欄や許可が欠ける、共有owner・通常K・回復条件にUnknownが残る場合は、行を保留し候補Pを起動しない。
- **AP02実装・AP05候補検証・旧試験切替は別の承認記録。** 旧試験切替を承認しなくても、旧試験を維持する別の候補検証を将来審査できるが、個別処遇・候補検証の許可やG01／G03／G04は省略しない。Pの不在、Dの成功や[AP04の結果差](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)を根拠に、旧assertionを削除・skip・弱化しない。
- 現状は**7票すべて未選択・未承認、G02未充足、SL01は起動0**。候補の入場、受入、保証回復、旧試験切替、公開は互いに代替しない。文書案によって閉鎖条件・Unknown・調査保留を解除しない。
