# WF-B SG-A後：provider／clock確認契約・操作一覧と費目所有

Version: draft-0.1 / Date: 2026-11-14 / 読取り基準HEAD: `9b945c8`。

Status: **詳細設計のみ。LOAD6／LOAD7の選択・provider／clock・配賦値は未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[鮮度・時間配賦設計§2〜8](BEST_PRACTICE_WFB_SGA_FRESHNESS_HANDOFF_BUDGET_DESIGN.md)と[依存pin・設定確認境界§2〜6](BEST_PRACTICE_WFB_SGA_DEPENDENCY_PIN_CONFIG_DESIGN.md)。metricの意味と既存の取得数は[開始時負荷採取設計§1〜7](BEST_PRACTICE_WFB_SGA_START_LOAD_CAPTURE_DESIGN.md)を引き継ぐ。本書は確認すべき証拠と費目の対応表であり、実装coverageの証明・実費測定・信頼承認ではない。

## 1 確認区分を混ぜない

| 区分 | 対象・今回の境界 | 得られるもの | 得られないもの |
|---|---|---|---|
| S：静的確認 | MD・宣言・許可されたcodeのテキスト読取り。import／resolver／getterは呼ばない | 記載された契約・呼出し候補・不整合・不足項目 | 実行実体・実解決先・scope安定性・精度・実費の確認 |
| F：合成確認 | 将来、別途承認した純粋fake／独立oracle | 値・順序・計数・境界・失敗prefixの合成保証 | 本物のprovider／clockの妥当性・性能・実停止保証 |
| R：実確認 | 別承認後の実体pin・同trialの実観測・終了確認 | 指定範囲・時点での実測／照合と、その限界 | 任意負荷での最悪時間保証・絶対的なOS状態の鮮度 |
| A：承認 | 要件・profile選択・操作範囲・保管等に対する明示判断 | 何を許すかという判断と対象版 | 観測済み／実証済みという事実 |

S／F／R／Aは別欄とする。`declared`／`static_consistent`を`runtime_verified`へ書換える単一の成功flagは設けない。同値の設定・診断summary・合成receiptから正規の実証拠へ昇格させない。現在は既存文書の静的整合を整理しただけで、providerの新規code照合、F／Rの実施、Aの取得を行っていない。

## 2 同trialへ結合する確認契約案

以下は非実行の記録項目案で、実identity・期待hash・許可値は未採取／未承認のままにする。内容一致・信頼承認・実行許可を別欄へ置く。

| 区分 | 必須の結合・記録候補 | 不足時 |
|---|---|---|
| 共通identity | 計画版、LOAD6／LOAD7の未選択状態、trial／H0・H1／P9・P8、source image参照 | 別版・別trialの証拠を足さずUnknown |
| provider固定元 | Node供給元・起動chain・依存image・provider code参照、許可された取得API集合 | version／path／型定義だけで実体一致としない |
| provider意味 | metric版、CPU counter単位と5bucket、CとNのscope、load／memoryの意味と未対応条件 | GUI CPU%・quota・pressure等へ読み替えない |
| clock固定元 | 同親ownerが保持するclock供給元・primitive候補・単位・domain・変換規則 | primitiveと単位は未選定。名前だけで同じclockとはしない |
| clock品質 | 非逆行の扱い、分解能・丸め方向・誤差の根拠、読取区間・scheduler停止の限界 | 精度不明を0誤差にしない |
| lifecycle | 同TrialOwnerの停止・期限・snapshot・receipt、失効後の拒否と最終custody | 送信済みだけで解放／保持成功としない |
| 操作coverage | §5の操作ID・費目owner・回数／構造上限・schedule・証拠区分 | 未割当て／未導出を残し、費用充足のgateを閉じる |

将来も任意getter／command／URL／resolver／clockを外部設定から差し替える登録口を正規供給元にしない。合成依存と実providerのidentity／台帳を共有せず、fakeによる成功を同trialのR欄へ移さない。これは実装の追加ではなく後続設計条件である。

## 3 provider確認matrix

| ID | 対象 | Sで確認する契約・位置 | 別承認が必要なRと限界 |
|---|---|---|---|
| PV01 | Node・起動chain・builtin供給元 | 依存pin設計の固定単位、既存wrapper・preload・許可root・宣言を対応付ける | binary／依存内容のbounded pin、実起動実体・実loadとの結合。Node hashだけでOS／ABI全部の一致を証明しない |
| PV02 | CPU counter | 固定5bucket・ms・非負安全整数、C=1〜256候補、項目別差分とreset拒否 | 実scope・更新挙動・counter epoch・読取途中の変化。sample成功だけで同数CPU入替え／並べ替えを排除したとはしない |
| PV03 | CとN | counter集合のCとavailableなNの別field・別用途 | 実provider／scopeと対象trialへの結合。C=Nと推定せず、worker数をoverrideして合わせない |
| PV04 | load | 固定3値・platform別unsupported・本当の0との区別 | 対象platformでの意味と実取得。unsupportedを0で補完しない。新規の公式仕様調査も今回は行わない |
| PV05 | memory | free／totalの単位・安全整数・free≤total、記録目的の限定 | 実scopeと取得値。pressure／swap／OOM余裕の証拠へ昇格させない |
| PV06 | 非atomicな取得 | bF／eFが全固定getterを囲むscheduleと、内部cache時刻未確認の明記 | 各getterの供給実体・挙動・費用。read_endを全fieldの同時取得時点にしない |
| PV07 | bounded実体確認 | 許可root・件数／byte／時間・変更検査・秘密除外の設計 | hash scan／copy／実解決・実load観測等。上限・終了owner・保管の承認前には実施しない |

型定義やsourceから得た意味、実Nodeにそのcodeが含まれること、その実Nodeが対象trialで使われたことは別証拠である。本書は前二者を新規に照合していない。特にscope／epochの同一性を現在のAPIだけで十分に確証できるかはUnknownで、OS監視調査・VM調査を再開して埋めない。

Rが必要でも、何を読めば何が分かるかを先に有限化する。実採取の観測範囲・件数・時間・保存内容・終了確認・未確認時の責務は個別承認へ戻す。「読取り専用だから実測してよい」とは扱わない。調査しても証明不能な前提は、未証明のまま比較適合を拒否する。

## 4 clock確認matrix・誤差と時刻境界

| ID | Sで確定すべき契約 | 別承認のR／未確認事項 |
|---|---|---|
| CK01 | a／p／b5／e5／bL／eL／h／g／iは同親domain。UTCとworker clockは別 | 選択したprimitive・実runtime・domain継続との結合。UTCを期限用へfallbackしない |
| CK02 | 単位・表現範囲・差分／加算の非損失性・msとの比較規則 | 実供給値・単位・範囲の照合。runtime未確認を型宣言だけで埋めない |
| CK03 | 非数値・負値・逆行・同一時刻・clock throwの扱い | 粒度・丸め・精度の根拠。連続読取りで逆行が出なかったことは全期間の保証ではない |
| CK04 | bF／eFの外にgetterを漏らさず、clock自身の費用も一覧へ含める | clock callの所要時間、非atomic読取、同期getter／親thread停止の限界 |
| CK05 | guard時刻gとcall入口iを別fieldにし、Tを予約する | call入口との観測対応・最終guard後の遅延。awaitなしを実時間上界としない |
| CK06 | suspend・domain再初期化等で前提を維持できない場合はUnknown／停止 | 対象runtime／OSでの意味・確認可能範囲。今回suspend等の環境操作はしない |

`Δ_recorded = i_recorded − bF_recorded`が計算できても、それだけで実経過の精度を証明しない。仮に同domainの各境界誤差上限εi／εbを**別途根拠付きで与えられる場合**、保守的な経過上界は`Δ_upper = Δ_recorded + εi + εb`という検討式になる。上限を知らない場合にε=0と置かない。単位変換・量子化による誤差も落とさず、共通offsetが消えることだけで全誤差ゼロとはしない。

この式は測定器の導入・校正手順でも、誤差値の承認でもない。clock品質をどう裏付けるか自体が未解決である。厳密な境界を根拠付き上界で確認できなければ、strict 1秒／6秒やinclusive 100msを丸めて通さず、`timing_unconfirmed`候補を保持する。精度不足を理由に元の5秒期限・並列度を変えない。

## 5 操作一覧・費目ownerの対応案

操作IDは費目の分類であり、新規API・実装済みstepを表さない。下位が操作を実行しても、同TrialOwnerが全体の停止・予算・診断・未解放責務を保持する。費目の実時間上界・実装source位置・coverage証拠は別欄が必要で、未実装欄をこの表で埋めない。

| ID | 操作・既知の回数／構造候補 | 費目の責任owner | 時間区間・費用の帰属 |
|---|---|---|---|
| OP00 | root診断・停止／予約・保持slotの先行準備。一度限りのconstruction | TrialOwner | arm前。部分生成・rollbackも同construction費 |
| OP01 | Node／provider／clock／依存の固定供給確認 | PinOwner、未確認時はTrialOwnerへ | arm前と終了後。scan件数・byte・時間は未導出、無制限walk不可 |
| OP02 | 同trial／pin／profile／domainのprivate結合・開始claim | TrialOwner | arm前。別trial・同値copy・未承認profileを拒否 |
| OP03 | arm clock採取とa／p／親期限の一度限り固定 | TrialOwner | arm境界。arm採取自体の費用をframe取得数へ混ぜない |
| OP04 | S0〜S5の6予定slot・予定照合・停止／入場確認 | SamplerOwner | 5秒窓内。jは開始遅れ。callback件数とclock呼出し数は別 |
| OP05 | Sの前後mono計12回・UTC計6回 | SamplerOwner | 各Sの取得境界。最終Sの取得区間はs |
| OP06 | SのCPU getter計6回 | SamplerOwner | 各Sの取得費。返却object／native allocation上界はUnknown |
| OP07 | Sのload／N／free／total計24回 | SamplerOwner | 各Sの取得費。6×4、CPU getterと合わせOS30回 |
| OP08 | sample projection・値検査。CPU field訪問候補6×256×5 | SamplerOwner | sample間処理とS5後処理を区別。payload訪問以外のmetadata検査は別途計数 |
| OP09 | 項目別差分。5×256×5の差分候補 | SamplerOwner | 有効な各区間。欠測を跨がず、resetを別CPUで相殺しない |
| OP10 | 5区間の集計・整数pair／比較用projection | SamplerOwner | LOAD6はS5後R、LOAD7はL前Q。演算幅・work単位は別設計が必要 |
| OP11 | LOAD7だけL一度。4 OS getter＋mono2回＋UTC1回 | SamplerOwner | l／Lmax。LOAD6ではnot_applicableで実行0。再L／retryなし |
| OP12 | 最終frame検査・固定schema／容量の受付 | SamplerOwner | LOAD6はR、LOAD7もL後R。全frame再走査があればその費用も明記 |
| OP13 | header／sample／interval／summary／terminalの固定encoding | Encodingの責任を持つSamplerOwner | 前半処理・Q・R・終端を区別。slot数は14／15候補だがencode試行総数は未確定 |
| OP14 | 一度限りの上位通知・private receipt照合 | CustodyOwner、受理未確認はSamplerOwner | 通知から確認までR内。受信側処理・queue待ち・throwも除外しない |
| OP15 | n／h／g／i等の追加clock・境界記録・診断更新 | TrialOwner | 各停止／入場点・R／T。取得48／55回の外。回数上限は後続scheduleで確定 |
| OP16 | 最終pin／停止／時刻／残予約guard・固定callへの受渡し | TrialOwner | R終端〜T。同call入口の対応を確認するまで未接続 |
| OP17 | call入口・試行有無・同期throw／復帰の固定分類 | 起動を所有するTrialOwner | iを終点とする起動前費用と、call内部／起動後費用を分離。今回callは未実施 |
| OP18 | 欠測・例外・取消・late・部分生成の固定失敗処理 | 発生時owner、最終はTrialOwner | 発生区間の費用＋終端責務。正常費と重複せず、費用0にも丸めない |
| OP19 | 元slot解放確認・未確認custody・固定terminal・終了確認 | CustodyOwner／終了owner、全体責任TrialOwner | 受理確認前にclearしない。終端費はsampler枠・外側cleanup等への所属を事前固定 |

OP05＋OP06＋OP07でLOAD6のframe取得は18＋6＋24＝48回、LOAD7はOP11の7回を加え55回となる。OP08のCPU field訪問候補は7,680、OP09は6,400差分であり、これらは全命令数・実work上界ではない。OP03／OP04の入場確認、OP15の追加clock、encoding・通知・例外・解放を48／55へ含めたことにはしない。

OP13／OP15などの回数、OP01のscan上限、各費目のbyte／work／時間係数は未導出であり、**全体の有限総費用はまだ成立していない**。後続の固定schedule・strict schema・実装coverageでこれらを閉じる必要がある。行が一覧に載っただけでcompleteにせず、not_applicableとunconfirmedも区別する。

## 6 費目の重複・漏れと時間配賦への結合

対応単位は`操作ID × phase × owner × profile × 証拠区分`とし、同一の実操作occurrenceには主費目を一つ割り当てる。時間・byte・演算量・通知回数という異なる軸の併記は許すが、同軸の支出を別ownerへ複製しない。移譲は既存prefixと残る責務の移譲であり、費用を0へresetする処理ではない。

LOAD6のS5後集計はR、LOAD7ではL前Qに置く。L後の検査・encoding・receipt待ちをQへ前倒ししたことにせず、Rのcoverageへ含める。clockの実callやprojectionがbF／eFの区間外なら、その費用を隣接区間へ割り当て、存在を消さない。非atomicな読取区間と操作費の全範囲が同じであるとは限らない。

最終pin検査は受領済みidentityと失効状態の固定確認を想定し、Tに実hash scan／再解決を追加する許可ではない。それ以外の再確認が必要ならOP01等に費用と時点を明記し、未導出なら起動しない。起動前に必須の解放確認も起動前費目へ含め、失敗後の外側cleanup枠で後から充足したことにしない。

入場前の残予約には未実行の必須操作・通知失敗／部分生成の固定処理・最終tailを含める。既に消費した費用も診断prefixとして残す。実行中はwall時間の遅れ・同期getterの非中断性を別に扱い、予定unit費を減らしただけで期限内終了が保証されたとはしない。

費目ごとの「sourceで対応確認」「fakeで拒否確認」「実費根拠あり」「配賦承認済み」は別欄とする。いずれかが足りないまま、未確認費を余り200ms／60msや外側cleanup予約へ押し込まない。元の5秒期限・既定並列度・既存起点を変更して帳尻を合わせない。

## 7 失敗診断・有限保持・権限境界

| 境界 | 保持・停止の契約案 | Unknownのまま残すもの |
|---|---|---|
| provider／clock確認不足 | 最初の固定理由・不足ID・同trial結合を保持し、未許可のgetter／起動へ進まない | 実体・scope・精度・実費の裏付け |
| 同期取得中の停止・遅い復帰 | 即時中断成功とはせずlateを保持。再L／再sample／再起点なし | 同期操作の終了上界・未確認の停止責務 |
| 通知throw・ack欠落・部分生成 | 元slotと上位の未受理責務を保持。summaryからreceiptを作らない | 解放未確認・最終custody |
| clock境界不明・call済み時刻違反 | 試行0・試行済み・未確認を区別し、親終了ownerへ渡す | 真のcall入口・未確認対象の終端 |
| 診断／容量不足 | 固定の最初の理由と有限な不足表現を先取りする。全文dump／無制限event追加なし | 部分生成物の保持上界・解放証拠 |

保持するのは固定ID・計数・時刻・状態・必要なopaque参照案に限る。CPU model、raw stack、環境全量、認証値、秘密値のhash、token file内容を証拠へ載せない。追加の確認ID・clock品質・coverage欄も既存header／summary等の有限fieldへ割り当てる必要があり、旧32KiB内と未計算のまま主張しない。

raw CPU二面20,480byteはlogical payload候補で、native／JS allocation・GCの上界ではない。14／15slotとencoding試行回数も別である。確認表・失敗診断を追加したstrict schemaと総byte／保持参照数の再計算は、今回完了させず後続の有限保持設計へ残す。未導出の間は実施前gateを閉じる。

## 8 静的確認と実確認の承認境界

今回の作業は既存MDの読取りと新しい設計・参照更新のみ。getter実行・Node版取得・実binary hash・依存tree scan・copy作成・resolver／module import・時計の連続読取り・OS値採取・config評価は行わない。静的確認の説明は、それらの実施許可ではない。

将来のRには、対象供給元・許可操作・固定件数／容量／外側時間・開始／終了owner・停止手段・保管条件・秘密非出力を個別に承認する必要がある。範囲不足をinstall・API変更・環境調整・設定override・外部問い合わせで補完しない。trust root承認・VM／監視調査・担当者連絡も再開しない。

依存pin設計のC0／C1／C2区分を維持する。通常主対照が元々通るC1の副作用は将来の主対照実行承認の範囲として扱い、別の設定だけ評価や観測hook／dumpの追加は別承認とする。token fileの探索・読取り・hash化・生成は今回行わず、通常起動での分岐通過有無も推測しない。provider確認という名目で元の主対照を変更しない。

## 9 後続の独立fake／oracle受入案（全て未実施）

| ID | 対照・故障 | 必須条件 |
|---|---|---|
| PCV01 | version／型定義だけ一致、実体pinなし | Sの整合だけを保持。R／信頼承認へ昇格しない |
| PCV02 | 合成provider・別trial／同値copy混入 | 正規provider／同trialとの混同拒否。欠落をUnknownのまま保持 |
| PCV03 | 同数CPU入替え・epoch／scope裏付け不足 | count一致で安定性証明とせず、適合を認めない |
| PCV04 | C≠N、load unsupportedの代用0 | C／Nとmissing／実測0を分離。worker数を補正しない |
| PCV05 | clock domain／単位違い・逆行・例外 | UTC代替・補間・表示丸め受理なし |
| PCV06 | 境界差99ms、各端点誤差1msという定数例 | 保守的上界101ms。100ms内へ丸めず、誤差不明を0にしない |
| PCV07 | getter区間外clock・入場guardの計上漏れ | 48／55取得だけで全費用充足と判定しない |
| PCV08 | Q／Rで同じ操作を重複、または両方未割当て | 主費目一つ・全必須occurrence対応。不正coverageを拒否 |
| PCV09 | encodeを複数回、slot数だけ14／15へ収める | encode試行とslotを別計数。未確定上限を成功にしない |
| PCV10 | 実体pin scan／時刻追加の費用・容量未導出 | 後続gateを閉じ、余り時間／旧32KiBへ無言で収容しない |
| PCV11 | 通知throw・部分生成・late復帰・失効 | 同ownerの先行理由・未受理／未解放prefixを保持。再取得なし |
| PCV12 | 計画選択／承認欄のみ充足、Rが未確認 | 承認と観測事実を分離。元5秒・既定並列度・閉鎖条件不変 |

oracleは対象の費目分類helperを再利用せず、固定操作列と独立したowner／phase期待表、取得数48／55、CPU訪問候補7,680／差分6,400、誤差上界の定数式で対照する計画とする。実装・テスト追加・実採取は行っていない。

## 10 後続順序・未承認事項

1. provider／clockの固定供給候補・確認可能範囲・誤差／scope不足の拒否条件を、Sと別承認Rへ分けてレビューする。
2. OP00〜19を固定schedule・実装source・回数／work／時間の上界へ対応付け、未導出欄を閉じる。今回の一覧を実装coverage完成とはしない。
3. 確認ID・時刻・診断追加込みのstrict schemaと有限保持、元slot／上位custodyの解放責務を再計算する。
4. 独立合成受入と必要なRの個別承認計画を整理し、要件・証拠が揃わなければLOAD6／LOAD7を選ばない。

- [ ] provider／clockの確認方法・対象版・S／F／R区分のレビュー。
- [ ] scope／epoch・clock誤差等の証明不能部分と拒否条件のレビュー。
- [ ] 全操作coverage・費目owner・未導出上界の確認。
- [ ] 追加field込みの有限保持・失敗時custodyの確認。
- [ ] 要件／選択と、実装・合成確認・実確認・保管の承認区分の確認。

全項目は未承認。LOAD6／LOAD7・clock primitive・Lmax・誤差値・取得費・32KiB profileを採用しない。本MDと親2文書の参照のみを更新し、元の5秒期限・既定並列度、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。実装・負荷採取・試験再実行・実接続・実通信・設定変更・コミット・Pushは今回行わない。

文書整合として対象3文書のローカルリンク12件・表20個の列数、PV01〜07／CK01〜06／OP00〜19／PCV01〜12のID連番、未承認チェック5項目、取得48／55回・CPU field候補7,680／差分6,400・誤差例101msの定数式、末尾改行と差分空白を確認した。文書と定数の静的検算のみで、実装・合成試験・実体pin・clock確認・負荷採取・試験再実行・費用上界の実証ではない。

## 11 後続の固定schedule・slot形状・encoding確定点（2026-11-14）

[固定schedule・最小field／slot形状・encoding確定点draft-0.1](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)で、PrePacketとas-of-zのTERM、固定encoding batch・追加clock観測点・失敗prefixの保持を対にした。record／encoding試行14／15、追加clock14／15は新しい未承認scheduleからの候補で、48／55取得を全費用へ昇格させず、実装coverage・byte／allocation上界・実費は未導出のまま残す。選択未承認・元5秒・既定並列度・各閉鎖条件・Unknown・調査保留と実装／採取／再実行未実施を維持する。
