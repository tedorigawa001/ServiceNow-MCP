# WF-B C-01：pin内部契約・先行scalar・readonly検査と固定診断

Date: 2026-11-11 / 基準HEAD: `554ef9a` / 未コミット差分の合成検証。

対象は[private pin設計§11 draft-0.2](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)、[生成・停止親§14](BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_STOP_DESIGN.md)、[bind親§15](BEST_PRACTICE_WFB_BODY_BIND_BORROW_DESIGN.md)。開始時の作業ツリーはクリーン。`b3776da`の(B)再検査／不在projection訂正・等価／観測不能の注記と旧試験を維持する。正式発行口・既存C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。

## 実装範囲と正常到達点

同package除外composition fixtureの同root／同startに限定した。rootには将来pin用13scalarとC-01検査準備用6scalar、空の返答cache参照、startにはpin操作位置／初回位置の2scalarを先行する。initializerは原始literal／undefinedだけ。sourceの22 own keyやmetadata、既存receiver9参照／10scalarは増やさず、新owner／frame／予算・pin object／台帳／friendを作らない。

新factory createProbeBodyPinContractsFakeはprepare／check／checkLegacy／close／inspectだけ。固定script以外のsource・summary・callback・任意objectを受け付けない。model=wfb-body-pin-contracts-1、正常もpin_contracts_held／ok=false／authority=none／execution=closedであり、将来のsource_pinned_unreadyではない。旧module export期待値には新しい開発factory名だけを1件追加し、facade／配布設定のexportは変更しない。

既存BS00〜14→BP00〜01を同frameで再利用し、元issuedと同startのreadonly契約検査だけを行う。SourceProvenanceは同一性→生成来歴→全22key／descriptor→元root／shell／binding／link／duty／control／start／failureを照合する。BaseUnused／StorageEmptyは既存厳密checker、PayloadEmptyは6参照・free／empty／prefix noneの専用checker。active保護frame・停止／先行理由・pin用scalar全初期値と、BP02 entryの値組をbefore／checked／afterで再検査する。

正常でもsource initializing／claim unused／pinCallReached=false、receiver expected-source3参照とpayload6参照は空、pinAttemptUsed=false／pinStage empty／occupancy free。root pin routeAttempted=false／state not_started／全位置none、preparingConfirmed／postChecked=falseである。PC01の開始記録・private pin call・格納・claim消費・BC00・grant／duty消費・body起動・readyは実行しない。

## 値checkerとowner検査の区別

source／receiverの値view・狭いSourceContract／ReceiverContractと、固定13checker（entry、callReady、receiverEntry、attempting、issued、captured、checked、confirmed、returned、pre、commit、post、held）を同module内部に定義した。各checkerの許可組は固定で、任意phase文字列を渡してownerへ採用する公開口はない。

同ownerへ接続するのはentryだけである。後段12個はcompiled scratch内の原始値モデルを検査し、実ownerにpin flag／参照／confirmed／preparingを格納して正例を作らない。scratchだけに値checkerをexportして対照し、元module／配布物には同exportを追加しない。値検査の成功を来歴・実観測・pin資格へ昇格させない。

## 診断・失敗保持

C-01検査準備の状態／位置／最初の理由は、生成診断と将来pin診断から分離した。準備位置はnone／before／checked／after／heldで、BP02〜04の実進行を表さない。検査失敗後は同rootの共通first・元返答を保持し、sourceFailureRecorded／生成失敗位置とpinFailureRecordedを更新しない。sourceへのfailed／first記録は確認済み元issuedに限り、sourceの粗い位置は最後のBP01／afterである。

build区分のfirstは共通root firstを再利用した値で、生成失敗の有無はfailureRecorded／失敗位置で区別する。source.firstとC-01 preparationFirstも別に表示する。生成中に失敗した場合は(B)診断だけが成立し、C-01 preparationは未開始。未確認sourceのfieldを診断のために読まない。

closeは固定失敗返答より先にroot停止を記録し、元確認済みsourceへ同期反映する。失敗後closeでも返答同一性・先行理由・最初の検査準備位置は不変。source／receiverのpin状態を補修・clear・再試行しない。チェック済み履歴がtrueでも失敗／close後の再開やready資格にはならない。保持はcleanup／解放確認ではない。

projectionは生成・検査準備・将来pin route・receiver pin位置を分け、固定allowlist／strict booleanだけを出す。元参照・symbol／owner由来値・raw Error／message／stack／causeは出さない。実OOMで診断が必ず返る保証はUnknownのまま。

## RED／GREENと切り分け

1. 正常系の公開factory試験は未実装のTypeErrorでRED。閉鎖factoryと初期値／readonly entry検査の実装後、1件成功。
2. 検査失敗と生成診断を分ける試験は故障script未受付のinput_rejectedでRED。固定故障／close／再入／先行理由scriptを実装後、2件成功。その後、3位置×4mode・生成失敗・close・敵対的引数へ展開し、新24件＋旧(B)200件の224件が成功。
3. 段階別のcompiled試験はBODY_PIN_PHASE_CHECKS未実装のReferenceErrorでRED。固定13checker実装後、正例13・全組合せ169・不正field351・欠落／extraの値検査が成功。
4. 初回lintは、契約型2つが未使用として失敗した。検査器引数の許可型をその契約から導く形へ結び付け、設定を緩めずerror 0へ解消した。
5. compiled helperがgeneric関数名の直後に開き括弧を要求しており、bodyPinSourceAtの注入先を見つけられなかった。generic宣言を含む正しい関数範囲へ修正した。
6. root停止の故障をcheckpoint内へ入れると、契約checkerより前の既存停止guardがconstruction_unconfirmedで停止した。停止対策を弱めず、最後のcheckerに入った後だけ故障させる対照へ移し、当該節が拒否する位置と節除去による見逃しを確認した。
7. payload条件の文字列は旧bodyFieldsInitialにも存在し、一意anchor検査が失敗した。RetirementStartAssemblyのbodyPinPayloadEmpty内へ注入範囲を限定し、旧節／assertを変更せず対照した。

5〜7は新試験の注入先／期待する最初の拒否位置の訂正であり、製品の退行・期限不足と分類しない。期限・並列度・製品設定・旧期待値を緩めていない。

## 独立試験・compiled保証

Vitestの新24件は公開5methodだけから確認する。正常閉鎖保持、3位置×4mode、生成throw／getter／Proxy、prepare前後close、summary／callback／敵対的入力、5methodへの余分な引数を検査する。生成事実・C-01準備の初回位置・将来pin未開始・receiver全空・claim unusedを別に比較し、凍結plain公開graphに500未満の上限を置く。新試験は本体のbuilder／状態表を期待値としてimportしない。

compiledは同sourceのscratch emitだけで行い、finallyで除去する。13正例の全169交差と、source13field＋receiver14fieldを各variantで壊す351拒否、欠落／extraを独立値oracleと比較する。値guard27節は個別除去で当該不正値が通る対照を持つ。SourceProvenanceの9metadata関係＋6来歴節、属性5種、pin用初期値13節、安定境界4種、payload6参照と、異なる位置での再failによる初回位置保持も確認する。

metadata／progressのenumerable・writableと、既知plain literalのextensibilityだけを変えたisSealedのwitnessを区別する。全descriptor節・全base節の単独感度を保証するものではない。provenance対照でprivate issuedを複製して壊す操作はscratch限定であり、通常実装のwrite-once来歴を任意private-slot改竄に対して証明したとはしない。

root19／receiver2の先行scalarのliteral初期値と空の返答参照をASTで確認する。root pin用13scalar・receiver pin／payload／占有field、sourceのpinCallReached／bindCallReached／postConfirmed／claimに、initializer以外の直接代入／更新がないことも確認する。これは接続していない操作境界の負の確認であり、既存有限故障scriptの動的definePropertyまでを含む任意改竄安全性の証明ではない。

projection allowlist14とstrict boolean5へ許可外値を注入してraw値が出ないことを確認する。semantic compile-fail12行でprivate checker外部呼出し・不正route phase／step／state／refusal、receiver位置、source pinCall／spent／preparingの不正組、receiver stage／attemptの不正組を拒否する。旧readonly metadata／状態型等のsemantic対照も継続する。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-body-pin-contracts | 24件成功、失敗0 |
| 関連31ファイル | 2,397件成功、失敗0 |
| 新compiled-probe-body-pin-contracts | exit 0。値variant13／351拒否・guard27・来歴15・属性5・初期値13・型拒否12等 |
| 旧compiled22本 | 全てexit 0。旧(B)再検査7／enumerable2、不在projection、旧field19／型拒否21と旧生成対照も維持 |
| composition＋新試験＋旧body6試験のstrict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（src／tests） | exit 0、error 0／既存warning 374。今回のfixture／新試験はerror／warning 0 |
| 梱包dry-run（offline・ignore-scripts） | exit 0、441ファイル。src／tests・今回のfixture混入0。archive生成／公開なし |
| 文書・差分整合 | 更新4文書のローカルリンク33件・表22件、設計11節／PC10行／CP14行と差分空白に異常なし |

関連31ファイルは前回の30ファイルに新probe-body-pin-contractsを加え、`bdo npx --no-install vitest run`へ明示した。全repositoryのVitest回帰は今回未実施。旧compiledはsource-issuer／storage-data-split／body-bind-fields／body-bundle／body-live／body-seed／local-exit／exit-guard／exit-preparation／grant-capture／run-preparation／frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの22本。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck`にcompositionと新pin-contracts／旧source-issuer／storage-data-split／bind-fields／bundle／live／seed試験を明示した。buildは`bdo npm run build`。lintは既存src／tests全体のJSONを集計した。packは一時cacheの`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`で一覧確認し、cacheはfinallyで除去した。依存取得・導入・設定変更はしていない。

## 未接続・Unknown

C-02／C-03のprivate caller資格・固定pin call・同startへの試行／格納・BP04の実状態確定は未接続。PC01〜10の実操作成功やCP表全体の合格を主張しない。型／値checkerの準備は、後段の同owner／同来歴への正式結合を代替しない。旧held root／公開summaryからの再開口はない。

pin試行・格納・source claim消費・payload borrow／bind・構築ready・body起動・回収／Journal・正式証拠・実予算更新は行わない。実allocation／layout・E／S／unit係数・全guard数／全体work・停止後解消予約・OOMでの診断必着はUnknown。正式発行口閉鎖・全体受付無効・調査保留を維持し、実接続・実通信・実機操作・設定変更・index登録・コミット・Pushは行っていない。

最終の作業中差分は合成fixture・新24件・新compiled・開発export期待値2箇所・CHANGELOG・設計3文書と本記録の10ファイルだけ。src・manifest／lockfile・TypeScript／配布設定はHEADから変更していない。これは未コミット作業内容の検証であり、コミット対象だけを別コピーで確認した記録ではない。

## コミット前の対象限定再検証（2026-11-11）

上記のindex未登録・別コピー未検証という記述は実装完了時点の記録である。今回の10ファイルだけをindexへ登録し、対象名が指定10件と一致することを確認した。そのindexの全追跡ファイルを新しい一時フォルダへ展開し、対象内容がindexとbyte単位で一致することを確認した。未登録・未追跡の作業内容や既存distをコピーせず、ローカルnode_modulesだけを参照した。依存の取得・導入はしていない。

同コピーでbuild・strict TypeScript・関連31ファイル2,397件・新旧compiled計23本が全てexit 0。新compiledの13値variant／351拒否・guard27・来歴15・初期条件13・安定4・payload6・属性5・初回位置保持・projection14／strict boolean5・先行root19／receiver2・直接操作書込み0・semantic拒否12を再確認した。全体lintはerror 0／既存warning 374、対象fixture／試験はerror／warning 0。offline・ignore-scriptsの梱包dry-runは441ファイルで、src／tests・今回のfixture混入0、archive生成／公開なし。更新4文書の33リンク・22表と設計11節／PC10行／CP14行・差分空白も確認した。全repositoryのVitest回帰は今回未実施であり、検証範囲を広げて主張しない。

再検証後の追記は本記録だけで、検証済みコード・試験・設定は変更していない。pin試行・格納・claim消費・bind・構築ready・body起動・正式発行は未接続、全体受付無効・Unknown・調査保留を維持する。本節はコミット直前の確認記録であり、実接続・実通信・実機操作・設定変更・Pushは行っていない。
