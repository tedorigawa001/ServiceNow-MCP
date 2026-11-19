# AP05 G02：ED01〜07の旧assertion・未代替保証・回復条件

Version: release-ap05-g02-old-assertion-recovery-draft-0.1 / Date: 2026-11-20。

Status: **静的整理のみ。G02は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 読取り基準 `ef6be90` は文書・旧test照合用で、製品候補ではない。

[AP05候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)のAP5-G02を、[G01の仕様根拠・到達辺照合](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)と[AP01残差台帳](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)のA1-I02、A1-X01〜03、A1-R02／05、A1-P01〜09に結ぶ。ED01〜07は既存の入口7件。正規分類は全件未対応、将来の個別処遇は未選択、保証低下の受容は未承認。現行の旧試験・期待値・故障位置の維持は既定の扱いであって、将来の処遇やfriend撤去の承認ではない。

先行AP03の未コミット差分5ファイル、通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 ED01〜07：元の観測、残差、引受先、回復条件

責務先は実装上の役割と審査上の引渡し先。人の担当・承認者・期日は未割当。旧source試験・既存compiled fixtureを含むH（旧根拠）、P（候補配布物）、D（開発側の補完）は分ける。同型の結果・同じエラー文字列・候補Pでの不在は、元の位置・同一性で拒否した保証を代替しない。

| ED／旧caseとAP01根拠 | Hで残す旧assertion（直接観測） | 未代替保証・読み替えないもの | 責務先 | 将来の回復条件・Pで別に必要な証拠（未実施） |
|---|---|---|---|---|
| ED01／SA-25・A1-X01 | [元SA](../tests/review/source-status-binding.test.ts)：通常生成した実sessionに推測object keyでclaim=false。第3引数付きsource生成が同期 `invalid_input` を含むthrow、capture未呼出し、requests=0 | 実sessionの既存状態で外部status consumerを採用しない保証。DR-20は別rootでの持込み拒否。元caseは `takeStatus` 未呼出し、無割当て、全状態不変、close完了を直接assertしていない | source constructor／session所有者。AP02のS02と通常K02／04、AP03のJS／宣言境界、AP05のH保持 | 回復は同じ実class結合・推測key・元拒否位置で4点を保持し、正規の初期source結合と通常Permitの正対照を別に揃える。PではC07-Bの通常2引数とJS明示undefined、旧creation拒否・callback非採用・通常会計を別確認。不在だけでは回復しない |
| ED02／SA-26・A1-X02 | [元SA](../tests/review/source-status-binding.test.ts)：SA wrapperの先行import後、class own `probeNewStatusAcceptance` 不在と `takeStatusAcceptanceProbe()` の同期 `internal_review_error` を含むthrow。最初の取得をcase内で直接assertしない | SA固有slotの先行消費後の再取得拒否とclass非露出の対。同じslotの取得口が存在した上での拒否で、Pのnamed link失敗・namespace不在・deep解決失敗とは非同等 | SA登録slot／wrapper所有者、公開境界・配布審査。AP02のS01／06、AP03 C06、AP05のFX04／PK02 | Hは元import順・同SA slot・再取得とclass非露出を保持し、[FX04](../tests/review/fixtures/compiled-source-status-binding.mjs)のcode検査を維持。回復側で初回取得を求めるなら別観測。Pは通常classの正常loadを正対照に、SAの旧名・登録・runner／別名・専用wrapper不在を分けて確認 |
| ED03／ND-30・A1-X03 | [元ND](../tests/review/native-session-composition.test.ts)：ND wrapperの先行import後、class own `probeNativeStatusComposition` 不在と `takeNativeStatusCompositionProbe()` の同期 `internal_review_error` を含むthrow。最初の取得をcase内で直接assertしない | ND固有slotの再取得拒否・class非露出。SA側の結果やDのnative連続試験では、ND旧rootの同登録・一度限り取得を代替しない | ND登録slot／driver・wrapper所有者、公開境界・配布審査。AP02のS01／06、AP03 C06、AP05のFX03／PK02。純粋診断・無bridge・resource所有とUN62はB-03別gate | Hは同ND slot・元import順と[FX03](../tests/review/fixtures/compiled-native-session-composition.mjs)の再取得時の正規表現検査を維持。Pの通常loadとND固有の旧名・登録・driver／別名・専用wrapper不在を分離。SAの証拠を流用しない |
| ED04／ACK-34・NS02 N2-X07 | [元ACK](../tests/review/private-composition-ack.test.ts)：creation内keyのobject／undefined／nullでclaim=falseと同期 `invalid_input`、全variant後にcapture未呼出し。同じ既存sessionで `chargePayload('x')` 後にpayload=1 | 元keyでの実session採用拒否と、拒否後も**同じ**sessionの会計が使える保証。payload=1を全状態不変としない。creation内keyがundefinedと、JS第3引数そのものが明示undefinedは別 | source／session・canonical accounting所有者。AP02 S02、AP03 C07-B／C06、AP05の旧ACK保持 | 回復は同一sessionで3入力・元の拒否位置・capture・後続payloadを保持。Pは型だけでなく実JS・転送呼出し、旧creation拒否と候補が許す明示undefined、既存sessionの後続利用を独立に観測 |
| ED05／ACK-35・NS02 N2-X08 | [元ACK](../tests/review/private-composition-ack.test.ts)：成功を返すstatic `claimCompositionSource` をテストで設置してもcreation付きsourceが同期 `invalid_input`、capture未呼出し。設置関数の呼出し数は直接assertしない | 成功値を返す外部の置換関数を信頼しない元境界。設置名を製品の現行APIとは数えず、候補Pでの不在だけから旧private verifierを通ったとは推定しない | 固定rootのsource／session所有者。AP02 S02のclaim境界、AP03 C06／C07、AP05のH保持・再露出対照 | 回復は同じ注入位置・旧拒否・capture非実行を保持。Pでは通常の初期source／ownerが実参照で結ぶことと、外部verifier・別名・互換shimが採用経路にならないことを別確認。新friendを観測口にしない |
| ED06／ACK-36・NS02 N2-R11 | [元ACK](../tests/review/private-composition-ack.test.ts)：`bindReviewReleaseSource` をno-opへ置換したsynthetic runのPromiseが `code: internal_review_error` で拒否。内部停止理由・効果数・正確な拒否site・cleanup完了は直接assertしない | hookが成功風に戻っただけではpreparedへ進めない、同source／Permit／port／登録ownerの実結合。案Pの受付での同期 `invalid_input`、Dのunknown／withheld、FX05の他のACK対照で置換しない | session／source／Permit／port・登録ready所有者。AP02 S03／05／07と通常K02〜04、AP04の結果差、AP05の故障位置・旧H保持 | 回復は同じno-op注入・実class／同故障位置・Promise拒否を保持し、正常な実結合を別対照にする。Pは通常matched経路の実binding成功と結合欠失で通らないことを別々に確認し、入口の同期拒否を後段保証の回復としない |
| ED07／CR04・NS05 N5-C04 | [元CR](../tests/review/release-comparison-receipt-session.test.ts)：推測key付きsourceが同期 `invalid_input`、capture／`observeReleaseUtc`／`acceptReleaseObservation` はすべて未呼出し | 実sourceのconstructorで外部観測receiverを採用しない元位置。Dのschema拒否や固定O供給は同field・同時計位置ではない。未呼出しは通常時計／採取全体が動かないことではない | 同source／sessionの観測・receipt所有者。AP02 S02／04／07、AP03 C07／C06、AP05とNS05の回復審査 | 回復は推測key・元constructor位置・3 callback各未呼出しを維持。Pは外部観測hook不在と、通常sourceの実観測・pin済みpolicy・legacy判定・通常停止を独立に確認。新しい公開clock／supplierを足さない |

ACK行の専用根拠は[NS02](BEST_PRACTICE_RELEASE_AP01_NS02_ACK_RELEASE_GUARANTEE_REVIEW.md)、CR04は[NS05](BEST_PRACTICE_RELEASE_AP01_NS05_OBSERVATION_COMPARISON_GUARANTEE_REVIEW.md)。FX04／FX03はSA-26／ND-30相当の2点を持つが、SA-25の4点は両fixtureにない。[PK01／FX05](BEST_PRACTICE_RELEASE_AP05_PK01_FX05_VERIFICATION_SPLIT_DESIGN.md)と[PK02／FX03・04](BEST_PRACTICE_RELEASE_AP05_PK02_FX03_FX04_VERIFICATION_SPLIT_DESIGN.md)の旧fixture・配布境界は維持し、ACK-36とCR04を既存fixtureの収録済みとは推定しない。[PK03／FX06](BEST_PRACTICE_RELEASE_AP05_PK03_FX06_VERIFICATION_SPLIT_DESIGN.md)の時刻・handoff対照もCR04の旧constructor入口の代替にしない。

## 2 個別の処遇記録と、3つの承認を分ける

AP01の個別票には、元ID・revision／入力・直接assertion・失われ得る条件、通常維持条件、未代替項目、停止／失効／未確認の保持先、将来回復の判定、承認者・日付・除外条件を記録する。対象ごとの維持／回復先行／保証低下受容の審査／受容不可・停止は未選択。個別承認のない残差を非提供済み・代替済みとせず、通常K条件は受容で弱めない。[AP04の結果差](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)も別判断で、旧rejectとDのunknown／withheldは非同等。

| 別承認 | 申請時に必要な範囲・証拠 | 承認しても含まないこと／欠落時 |
|---|---|---|
| AP02実装 | 対象となる定義・登録・呼出し・解放・成果物の範囲、共有ownerと残す通常経路、参照する確定仕様、影響EDの処遇と回復責務、旧試験・fixtureを保持する境界 | 設計採用や文書の存在で撤去を許可しない。対象patchの実装許可は候補検証・旧試験切替・保証低下受容・設定変更・公開の許可ではない。共有責務／旧試験維持が不明なら着手しない |
| AP05候補検証 | 旧Hを維持した別のPの対象・許可操作・entry／対照・禁止範囲。G01仕様、G02処遇／許可、G03段階別pin、G04終了四軸・通常枠／cleanup予約・残存責務の根拠 | 限定対照の個別承認や候補patchの許可は候補検証を代替しない。旧試験切替の承認は検証前に要求しないが、旧試験の維持と影響行の検証時の扱いは固定する。必要証拠・承認が欠ければ起動0 |
| AP05旧試験切替 | 旧ID・故障位置・assertion単位でHと移行先を対応付け、承認済み版の独立正負対照・compiled等の成果物・確認済み終了、新旧の残差／個別処遇／回復条件を提示。切替対象となる試験・fixture・期待値を限定 | Pの不在・Dの成功・候補検証許可だけで旧Hを削除／skip／改変しない。未代替はAP01の個別判断を別に要し、処遇・証拠が不足なら旧試験を維持。公開・AP06は別承認 |

## 3 回復判定と現時点の停止

- **回復と認める範囲を固定する。** 元入力・元の注入／停止位置・同session／source／slot・元assertion・元期限を先に記録する。同じ障害の判別では比較する正対照と負対照を分け、元source／対象compiled artifact・終了確認を揃えてから行単位で再レビューする。旧経路を非提供にする場合、P側で確認した「通常が動く／禁止入口に到達しない」は別の保証として記録し、旧経路の不具合検出が回復したとは書かない。
- **維持できない、または確認できない場合は止める。** 通常K条件・共有ownerに未確認がある、元assertionが弱くなる、残差の引受先が定まらない、あるいは対象・処遇・許可範囲が欠けるならUnknown／調査保留。既存試験と閉鎖条件を保持する。新friend・公開supplier・互換shim、期限延長や検査の読み替えで不足を埋めない。
- **G02は未充足、SL01は起動0。** 本票は候補検証の入場材料であり、AP02実装・候補検証・旧試験切替のいずれも承認しない。候補revision・digest、数値・観測手段・保全方式・保全先は確定しない。
