# AP05 G02：ED01〜07 回復先行案の横断審査表

Version: release-ap05-g02-ed-recovery-cross-review-draft-0.1 / Date: 2026-11-20。

Status: **静的審査案のみ。7件とも処遇は未選択・未承認、元保証の回復は未確認、G02未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準 `dd36197` は既存文書と旧testの読取り用であり、製品候補ではない。

[個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)の7票へ、7本の回復先行案を横断した共通正対照、各行で残る保証、不足証拠を渡す。[G02旧assertion・回復条件](BEST_PRACTICE_RELEASE_AP05_G02_OLD_ASSERTION_RECOVERY_DESIGN.md)と[AP01残差台帳](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)の分類は変えない。[G01照合表](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)の採用根拠・到達辺は参照し、仕様採用を実装・分離済みの証拠にはしない。

通常経路・旧試験／fixture・期待値・注入位置／import順を維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・変異操作・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 共通の通常正対照：再利用できるのは一致した証拠だけ

[AP02の維持K](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)と[AP05共通受入](BEST_PRACTICE_RELEASE_AP05_PK01_PK04_CANDIDATE_ACCEPTANCE_DESIGN.md)に従う。Hは旧revisionの元case／旧compiled、P+は候補の通常正対照、P0は同じ未変更候補の不在／拒否、PΔはP+／P0後の一変異一copyの構造検出、Dは別brandの開発補完。相互に代用しない。P+／P0は同じtarball由来の隔離展開rootと実解決先に固定する。添付は配布payloadと分け、repo `dist`、src／tsx、隣の成果物、開発loaderへfallbackしない。

| 共用する正対照（すべて未実施） | 何を確認するか | 参照するEDと共用の限界 |
|---|---|---|
| 通常module・K01、SL05／06の通常会計 | 残す通常module・class／factoryと必要依存の正常load、合成依存での通常生成・単一coreのC/G/P、通常GET、予約・固定close | 全7件の不在検査の前提。ED04で特に必要だが、無故障の会計成功は、拒否直後も**同session**で計上できた証拠ではない |
| K04／SL08：pre-I/Oの初期結合 | options省略で通常2引数sourceを内部生成。同session／snapshot／lease／owner／sourceで transport claim → `bindInitialSource` → `claimStatusBinding` → 同core会計。同期 `constructor_bound`、auth=false／ready世代0、C/G/P=0、予約返却・固定close、dispatch不可・正式発行無効 | 主にED01〜05。旧外部claim／friend登録でも後段Permitでもない。summary上の `bound` や同値copyは参照同一性を代用しない |
| K02／SL09：`matched` 後の通常Permit | 別の通常2引数source／sessionで親→legacy release判断→`matched`。同sourceのPermit／固定snapshot／portと同session・登録owner／現在のreadyを実結合し、同Permitで通常の後続metadataへ進む | ED01〜07のうち共通PKの後段対照を参照する行で共用可。特にED06の実bind、ED07のPermit対照。K04のpre-I/OやED06の結合欠失を代用しない。通常Permitは正式発行を意味しない |
| C07-B／SL10：通常引数の受入 | 直接new／転送で通常2引数を維持。JSでのみ第3引数そのものが明示 `undefined` の形を別に受理し、宣言は2引数。実際に転送された引数個数を保つ | ED01／04／05／07の入口審査に参照。creation内の `key: undefined`、その他の第3値、4引数以上は許容側に含めず、SL17の拒否と別判定 |
| K02／03・SL12：通常観測・停止 | 同sessionの `startedAt`・開始時点の全 `deadlineMs`・pin済みpolicyと、通常clock由来の観測日時／legacy判定。取消／期限・一次理由・通常owner失効・停止／資源解放を別欄で確認 | ED07の主対照、ED06の失敗時解放にも参照。通常観測日時を固定Oや設定日時で埋めない。旧時刻clearがないことは通常停止の成功ではない |

共用は、同候補pin・検査器／入力・通常entry・指定判定・post-pin・終了証拠まで一致する**同じ観測記録への参照**に限る。初期結合・後段Permit・引数variant・取消・欠失はそれぞれのrun／判定欄を持つ。共用を理由に、固定slotの統合・省略、費目の零扱い、旧試験の削除、承認票の合併をしない。組み合わせや割付が現行manifestで一意でない部分は新規slotとみなさず未確定のまま返す。

## 2 7票の審査表：個別の未代替保証と承認前の不足

下表の旧assertionは静的に確認した根拠。新しい実行結果はない。「不足」は、その証拠の範囲・取得計画を個別審査で確定し、必要なら別承認後に観測する項目であり、この表による実行指示ではない。

| 票・個別設計 | Hで残す直接観測と未代替保証 | P／別対照でこの票に固有の不足 | 主な責務先（役割のみ） |
|---|---|---|---|
| [ED01／SA-25](BEST_PRACTICE_RELEASE_AP05_G02_ED01_SA25_RECOVERY_ACCEPTANCE_DESIGN.md)・A1-X01 | 同じ既存実sessionで、直接の推測key claim=false、旧creation付きnewの同期 `invalid_input`、capture未呼出し、`requests=0`。候補で旧claimが消えても元位置のfalseは移らない | SL17の同期拒否位置・capture・同session request会計と、S02の旧claim／callbackの出力・到達辺の切断が未確認。DR-20、`requests=0` 単独、K04のpre-I/O会計で置換不可 | source／session、旧試験、配布審査 |
| [ED02／SA-26](BEST_PRACTICE_RELEASE_AP05_G02_ED02_SA26_RECOVERY_ACCEPTANCE_DESIGN.md)・A1-X02 | SA wrapper先行評価後、class自身の `probeNewStatusAcceptance` 不在と、存在する同SA slot取得口の再取得時の同期throw。初回取得は直接assertせず、FX04は `code` 検査 | SL18のSA固有のnamed link／namespace own名／class口、slot・static代入・runner・wrapper／到達辺と出力層を独立確認。通常module欠落やND側の結果は不可。候補での不在は旧再取得拒否ではない | SA slot／wrapper、session／lifecycle、配布審査 |
| [ED03／ND-30](BEST_PRACTICE_RELEASE_AP05_G02_ED03_ND30_RECOVERY_ACCEPTANCE_DESIGN.md)・A1-X03 | ND wrapper先行評価後、class自身の `probeNativeStatusComposition` 不在とND固有slotの再取得時の同期throw。初回取得は直接assertせず、FX03は正規表現検査 | SL19のND固有の取得口・登録・runner・native driverへの辺、解決済み動的／専用型／各出力層。旧SA／ND共有継続と、無bridge・共有診断／resource所有の引受先が未確認。SA、Dのnative連続試験、LM03／UN62で代替しない | ND slot／driver／wrapper、B-03、session／lifecycle、配布審査 |
| [ED04／ACK-34](BEST_PRACTICE_RELEASE_AP05_G02_ED04_ACK34_RECOVERY_ACCEPTANCE_DESIGN.md)・N2-X07 | **同一旧session**でcreation内keyの空object／`undefined`／`null` ごとに直接claim=false・同期 `invalid_input`。ループ後にcapture未呼出し、同sessionの `chargePayload('x')` 後にpayload=1。拒否前Pや全状態不変は元assertionにない | SL10／17の直接／転送と引数そのものの明示undefinedを分離。候補の拒否後会計は別対照で、同session・同coreの前後、UTF-8 1 byte増分、既計上をresetしない非ゼロP対照を要確認。新sessionや無故障chargeで代えない | source／session、canonical accounting、旧試験 |
| [ED05／ACK-35](BEST_PRACTICE_RELEASE_AP05_G02_ED05_ACK35_RECOVERY_ACCEPTANCE_DESIGN.md)・N2-X08 | 試験がclass staticに常に成功を返す `claimCompositionSource` を設置しても、旧creationが同期 `invalid_input`、capture未呼出し。設置名は現行製品のverifier APIではなく、呼出し回数は元assertionにない | K04／K02の同owner実照合を公開成功値なしで示す証拠、S02の旧採用辺・再露出／別名の個別判定が不足。ED05固有の再露出変異と期待理由は未固定。試験のstatic設置を候補の再露出に数えない | 固定rootのsource／session・登録owner、旧試験、配布審査 |
| [ED06／ACK-36](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_RECOVERY_ACCEPTANCE_DESIGN.md)・N2-R11 | 旧synthetic runのprototype `bindReviewReleaseSource` を非throwのno-opにし、返ったPromiseが `code: internal_review_error` で拒否。候補の禁止own `synthetic_io` の**同期** `invalid_input` やFX05正常preparedでは代替不可 | 通常実bindと、matched材料／同source内Permit・portは正規で**登録ownerへの結合だけが欠ける**別runを区別。同未変更候補と両立する注入・観測方式は未確定。診断を先に呼んで停止させず、最初の通常metadata guardで取得前に拒否、一次理由・後続取得／dispatchなし・停止／解放を別確認する。別artifactのDやPΔは代用不可 | session／source／Permit／port・登録ready、旧試験、AP04結果差 |
| [ED07／CR04](BEST_PRACTICE_RELEASE_AP05_G02_ED07_CR04_RECOVERY_ACCEPTANCE_DESIGN.md)・N5-C04 | 旧creationの推測key位置で同期 `invalid_input`、`capture`／`observeReleaseUtc`／`acceptReleaseObservation` は各未呼出し。全時計非実行・receipt全状態は元assertionでない | SL17の候補拒否・各hookと、S02／04／07・SL20の旧観測／receipt／handoff辺・出力層を別確認。通常観測日時・pin済みpolicyと純粋値module、通常stop／rollback／共有writerを切らない証拠が必要。MT11の旧synthetic入口やFX06・固定Oでは代えない | 同source／sessionの観測・receipt、lifecycle／回収、旧試験、配布審査 |

P0の入口拒否、名前の不在、実行／型／出力層の到達辺不在は別証拠。PΔは[固定slot／変異manifest](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)で指定済みの一次理由と単独差分だけを確認する案で、変異artifactを実行しない。SAとNDの変異、旧時刻辺と通常欠落の変異を流用しない。未解決動的辺・対象不明・依存欠落・別理由を不在／検出済みとしない。追加の行固有対照は独立に審査し、既存manifestで網羅済みとはしない。

## 3 承認前に埋める欄と、別承認後にしか得られない証拠

| 承認前の不足 | 今、静的に確定できる範囲 | 別の許可・実施後でなければ揃わない証拠 |
|---|---|---|
| 個別処遇票（A1-P01〜10） | 7票の元case／注入位置／直接assertion、未代替保証、通常Kとの関係、回復判断の条件を分離。設計上の役割は識別済みだが、個別の引受・承認者・期日は未記入。非提供を審査するなら、失う観測・外部影響／説明・責務・将来回復条件を各票に明記する | 維持／回復先行／非提供等の個別決裁と、必要なら保証低下の受容。対象範囲に対する証拠がなければ保留。H保持・設計のコミット・P不在から決裁を推定しない |
| 切る辺・残す正対照の具体化（G01、EV02） | S／K、元caseと配布層、entry／subcheck・注入と指定判定の対応を作る。特にED06の欠失だけを起こす方法、ED04の同session会計、ED05の再露出理由、ED07の共有stop／時刻の分離、SA／NDの到達先を一意にする計画が不足 | 許可された候補に対する通常の実参照・P0の到達辺・所定PΔの結果および必要な終端。許容範囲内で観測できない場合はUnknown。新friend・公開getter・設定変更で不足を埋めない |
| 同一候補・段階別の固定（G03、EV01／02／07） | 対象commit／tree・実Node／依存・検査器／入力の固定欄と添付境界を審査。文書基準 `dd36197` は候補指定ではない | 承認された段階ごとの実体照合と空build manifest、同tarballのdigest、展開manifest／実解決先、post-pin。後段のdigestを前段の前提にせず、後段の成功で先行pin不足を補わない |
| 終了四軸・費目上界・保全（G04、EV03〜10） | 対象／site・失敗prefixを通常枠と一度限りのcleanup予約へ対応付ける。時計／待受、runner・子worker、stdio、cleanup／保全の観測点・責務と停止規則を審査する。数値・観測手段・保全方式／先は未承認 | 承認済みの範囲でのみ、同slot／attempt（該当時は同generation）に四軸・期限内の確認・post-pinを結ぶ。未確認時の上位保持と同票照会、各費目の根拠が必要。終了ログ・元testのfinally・固定拒否は解放完了を証明しない |

[静的不足表・限定対照の承認票案](BEST_PRACTICE_RELEASE_AP05_STATIC_GAP_LIMITED_CONTROL_APPROVAL_DESIGN.md)のEV／QAは不足の照会先。QAの個別承認は、G02個別処遇・保証低下、AP02実装／friend撤去、AP05候補検証、AP05旧試験切替、AP04の結果差の受容、AP06公開とは別。未承認の候補結果を取得することを最初の審査の前提にせず、まず許可範囲・未取得理由・取得後の判定条件を申請に明記する。必要な候補証拠を未取得のまま回復／受入を承認しない。

## 4 審査の順序と受渡し

1. まずED06の通常の実bind・結合欠失を判別できるかを審査し、続いてED04／05／01の通常会計・初期結合とC07を照合する。ED07の時刻・共有停止の分離を確認し、ED02／03の専用閉包と各引受責務を別々に審査する。これは既存の個別処遇案に沿う審査順で、slotの実行順や処遇の選択ではない。
2. 各票へ元case／基準、共通正対照の参照、個別結果・不足、担当役割・回復条件、必要な承認を戻す。G01の未解決到達辺、[G03の段階別pin](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)、[G04の隔離・終了・保全](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)を[候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)に結ぶが、この表はどのgateも通さない。
3. 処遇・必要な許可・対象pin・通常K／共有責務の根拠、前slot終端またはcleanup予約が不足する場合は起動0。試行後の未確認は、最初の理由と残存責務を保持し、後続の起動や再実行へ進まない。**7票は全件未選択・未承認。G02未充足、SL01は起動0。**
