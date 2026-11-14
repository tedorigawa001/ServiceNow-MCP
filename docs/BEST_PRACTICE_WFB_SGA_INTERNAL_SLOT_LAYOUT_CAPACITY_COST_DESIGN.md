# WF-B SG-A後：内部slotの論理配置・容量算定規則と費目所有

Version: draft-0.1 / Date: 2026-11-14 / 読取り基準HEAD: `e28c957`。

Status: **論理配置・容量算定と費目所有の詳細設計のみ。LOAD6／LOAD7の選択・storage／writer方式・容量cap・以下の内部配置案は未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[phase別保持・内部slot最小値域draft-0.2](BEST_PRACTICE_WFB_SGA_PHASE_RETENTION_SLOT_DOMAIN_DESIGN.md)と[provider／clock・操作費目所有設計](BEST_PRACTICE_WFB_SGA_PROVIDER_CLOCK_COST_OWNERSHIP_DESIGN.md)。[同backing所有・退出／退役draft-0.2](BEST_PRACTICE_WFB_SGA_BACKING_OWNERSHIP_WRITER_EXIT_DESIGN.md)、[固定schedule draft-0.3](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)、[strict field draft-0.3](BEST_PRACTICE_WFB_SGA_RECORD_FIELDS_ENCODING_DESIGN.md)の所有・順序・回数を変えない。新しい型・buffer・serializer・issuer・計数器を実装する契約ではない。

## 1 容量の四層と記法

P=13／14、N=P+1=14／15をそれぞれLOAD6／LOAD7のPrePacket／全record数とする。候補を並記するだけでprofileを選択しない。容量の軸は次の四層に分ける。

| 層 | 本書で扱うもの | この値から保証しないもの |
|---|---|---|
| 値域 | enum・整数・固定長値・private参照の必要な区別 | 実装のbit幅、取得済み・許可済みという事実 |
| 論理配置 | 固定field位置、tagとpayload、参照cell数の算定候補 | JS object／配列／native structの実配置・allocation個数 |
| 実保持 | 参照先、同backing、別copy、scratch、部分生成物、stack、一時値 | wire長と同じ容量、参照clear後の即時解放 |
| allocator／実時間 | header・alignment・pool・GC・OS、同期操作・待ち・scheduler | 本書では未導出。Unknownを0にしない |

算定案L0は、論理byte量を`s + q×ρ`と書く。sは候補規則で幅を置けるscalar領域、qは参照保持位置数、ρは**未確定の参照cell幅**である。ρ=8等を実機の名称・bit数から推定しない。参照先のobject／token／closureのpayloadは別項であり、q×ρへ含めたことにしない。同じ参照先へのaliasでも、別保持位置のcell費は残る。

L0の幅・field列は算定レビュー用の未承認候補で、実装型の選択ではない。以下で数値が出るのは**列挙したfield部分の論理サイズ**に限る。完全な内部slot・総memory・合法最大の上界として流用しない。

## 2 L0のfield幅・variant・拒否規則

| 算定単位 | 論理幅候補 | 適用条件／非適用時 |
|---|---|---|
| tag／Bool／小index | 1byte／位置 | bound済み版の閉じた集合が256値以下。未列挙のenumに自動適用せずUnknown |
| bounded整数 | 2byte／位置 | 非負整数0〜65,535。j≤15、B[j]≤1,507、既存Counts最大7,680等の範囲を検査。超過を切詰めない |
| U53／U64／F64 payload | 8byte／位置 | 既存の値域・lossless条件を満たす値だけ。JS Number／BigIntの実heap幅ではない |
| UTC payload | 24byte／位置 | 既存の固定24 ASCII候補。内部string表現・header・変換一時領域は別 |
| 有限演算途中値 | 128-bitは16、256-bitは32論理byte／位置の候補 | 必要な同時位置数と演算器の実表現は未確定。widthだけで演算workspaceをcoveredとしない |
| private参照cell | ρ／位置 | 同ownerの実参照。外部ID・index・hashへ置換して権限を再生成しない |
| 非適用／空payload位置 | 上記の予約幅を維持 | tagで未開始・非適用・未確認を分ける。空だから容量0とはしない |

variantはtag位置とpayload位置を分ける。例えばmono観測はtag1＋payload8＋origin参照1位置、UTCはtag1＋payload24＋origin参照1位置とする候補。非ok時にpayloadを正規値として読まない。予約領域の初期値が0であっても、観測値0・取得なし・cleanup成功の意味を与えない。

同じ固定variant位置を再利用する場合の予約はtag＋最大payloadであり、排他的variantのpayload幅を全て足さない。ただし、候補と失敗前値を同時に保持する別slot、sealed値の別copy、旧frameの局所参照があれば別項にする。phaseが違うという説明だけで同時保持を除外しない。

Capacity observedには、受理範囲内で確認した値と、超過／不正／未確認tagを分ける。範囲外のraw値を2byteへ丸めず、exact値が必要なら有限表現を別レビューする。tag化しても既発生のoversize backingは消えず、その実容量に既存予約包絡を適用できない。任意getter／Proxyを呼んで値を取り出す許可も生じない。

## 3 root・record・roleの配置境界と列挙部分

Contextは同owner／trial／plan／source／pin／schema／profile／provider／clock／停止／予算等への正規結合を保持するroot側の設計名。recordはContext実参照を通して同一性を検査する候補であり、serialized IDからContextを引き直さない。Context自体の全field、既存ownerとの共有・保持位置、参照先実体の容量は未確定である。

次表は**管理field列挙部分**の一つの配置案。全内部責務をこの列だけで満たすという宣言ではない。参照名は独立した保持位置として数え、同じ対象を指す場合もcellは省略しない。存在しない確認物の位置も先に空で保持する候補で、確認物の発行を行った意味ではない。

| ID／scope | scalar列（tagは各1、u16は各2byte） | private参照列 | 列挙部分 s／q | 初期生成の主費目・owner |
|---|---|---|---|---|
| LC01 Anchor／record | state・record_index・kind・claimの4tag、B[j]のu16 | context、record_cell、attempt | 6／3 | OP00で位置、OP02でbinding。TrialOwner |
| LC02 Holder／record | acquire・capacity・custodyの3tag | anchor、backing、custodian | 3／3 | OP00。TrialOwner、取得後も元Holderが保持 |
| LC03 Capacity／record | view・extent・storage・evidenceの4tag、request・offset・length・extentの4u16 | anchor、view、capacity_origin | 12／3 | OP00。TrialOwner、確認時はSamplerOwner |
| LC04 Grant／record | state・enter_claim・revokeの3tag | anchor、origin、epoch | 3／3 | OP00。TrialOwner、利用中は固定encoding継続 |
| LC05 Exit／record | frame・inflight・candidate・joinの4tag、cursor・inflight_begin・inflight_endの3u16 | anchor、grant、frame_origin、exit_candidate | 10／4 | OP00。TrialOwner、固定callerがjoin責務を保持 |
| LC06 Publish／record | phase・claim・postの3tag、used_lengthのu16 | anchor、sealed_input、backing | 5／3 | OP00。TrialOwner、固定encoding継続 |
| LC07 Retirement／record | local_role・local_ref・custody・reclaim・OS_returnの5tag | anchor、custodian、retire_origin | 5／3 | OP00。TrialOwner、上位移譲後も未確認を消さない |
| LC08 BorrowRole／各4role | role_id・state・enter_claim・retire_claimの4tag | anchor、origin、epoch、enter_evidence、retire_evidence | 4／5 | OP00。同recordの固定4位置、最終TrialOwner |
| LC09 RecordCell／record | state・seal_claim・encode_claimの3tag | canonical_value、sealed_value、anchor | 3／3 | OP00。TrialOwner、値更新はSamplerOwner等の既存担当 |

epoch参照は固定originへ結合する案で、epoch方式の採用ではない。counter方式を選ぶなら有限上限・overflow拒否・追加fieldを別算定し、この表のepoch参照を整数へ無言で置換しない。frame／candidate／evidenceの参照先生成費と容量も、参照cellだけでcoveredとしない。

LC01〜07の和はrecordあたり`44 + 22ρ`、LC08の4位置は`16 + 20ρ`、LC09は`3 + 3ρ`。合わせて`63 + 45ρ`／recordの**列挙部分**となる。LOAD6では`882 + 630ρ`、LOAD7では`945 + 675ρ`。これは12N=168／180の論理群位置を列挙したもので、同数のobject／allocationを要求・確認した意味ではない。7Nの管理群と4Nのrole、N個の値cellを重複させず区別する。

TERMのsegment_build／packet_custody位置は非適用でも、固定4role配置案ではLC08の空位置として残る。適用roleは54／58、配置位置は56／60のまま。LOAD6用に空L位置を追加する実装案なら、このNに含まれないmetadata費を別項に追加する。

## 4 root側の部分算定と未列挙field

| 対象 | L0の列挙部分 | LOAD6／LOAD7・費目境界 |
|---|---|---|
| mono実観測結果 | 各tag1＋payload8＋origin参照1＝9＋ρ | 26／29位置。OP03／05／11／15の既存clock結果 |
| UTC実観測結果 | 各tag1＋payload24＋origin参照1＝25＋ρ | 6／7位置。OP05／11。期限用monoと別 |
| 予定S時刻 | 各tag1＋mono payload8＝9 | 固定6位置。aの正規originはrootから参照、追加clockなし |
| Timing上記部分 | 実観測32／36位置＋予定6位置 | `438 + 32ρ`／`490 + 36ρ`。h・record側時刻aliasの追加参照位置はここに含めない |
| Failure上記部分 | first_state・reason・FS・OPの4tag＋12 Bool位置＋origin参照1 | `16 + ρ`。内部追加故障分類・保持先は下記残項へ。raw例外なし |
| Counts上記部分 | group状態1tag＋既存9計数の各u16＋budget参照1 | `19 + ρ`。各profile上限以下の受付が必要。wireは従来のU64文字列のまま |

上の管理field列挙部分＋Timing部分＋Failure部分＋Counts部分の形式和はLOAD6が`1,355 + 664ρ`、LOAD7が`1,470 + 713ρ`。これは**部分台帳の整合検算値であって、完全な管理容量上界でもheapの下界でもない**。実装で埋込み・共有・packingが変わればこの形式とは対応しない。ρや以下の残項が未導出の間、byte総量やcap充足の数値は出さない。

| 未列挙／別算定の残項 | 必要な次の記載 | 現在の扱い |
|---|---|---|
| Context・Control・Receipt・予約／進行・construction／failure shell | exact field列、scalar／参照位置、固定診断・停止・phaseの全状態、部分生成prefix | Unknown。root群を一律1byteや1参照へ潰さない |
| 値／sealed入力・時刻alias・packet／segment table | strict入れ子ごとのfield列、labelの実保持／共有、h等の参照位置、同時に残る旧draft | Unknown。wire長・canonical cellの3参照で値payloadまで算定したとしない |
| origin／epoch／frame／claim／確認物の参照先 | 同一実体の共有根拠、生成前／後と失効後の保持、closure捕捉先 | Unknown。private参照先を無料・既存objectだから追加保持0としない |
| scratch・provider戻り値・演算／encoding途中値 | 同時位置数、128／256-bit等の幅と実表現、実参照／copy、token・stack・部分生成物 | logical scratch20,480byteだけ既存。その他と実capacityはUnknown |
| allocator・metadata・shared storage | alignment／header／配列capacity／pool／GC、実backing extent・失敗allocation | Unknown。論理幅や事後検出だけで実memory保証なし |

残項は後から都合よく選ぶ余り枠ではなく、算定が未完了である理由として同版の台帳へ保持する。部分和に残項を加える際も、既に列挙した同じfield／backingを再加算しない一方、別保持位置や別copyは省略しない。配布wireへfieldを追加してこの内部台帳を運ぶ方式は採用しない。

## 5 固定構築・更新・失敗prefixと所有

| ID | 固定境界の設計案 | 主費目／保持責任 |
|---|---|---|
| LS01 | 最小のFailure／停止／部分生成保持先を先行確保し、root群と固定index台帳を構築 | OP00、TrialOwner。最小shell自体の構築失敗を含む外側保持境界・容量も未確定であり、完全保持保証はまだない |
| LS02 | record値cell・7管理群・4role位置を固定順で準備し、空参照／未開始tagを保持 | OP00、TrialOwner。途中prefixを保持、同constructionの作り直しなし。対象配列のgrowなし候補 |
| LS03 | 同root／source／trial／pin／schema／profileを固定Contextから結合し開始claimを一度扱う | OP02、TrialOwner。内容同値・別Context・未選択を正規bindingへしない。正規実発行口は閉鎖 |
| LS04 | 既存schedule位置で値／時刻／計数を一度更新し、対応するsealed入力を固定 | 各取得／更新の主費目は§6。空位置の初期化と観測更新は別occurrence |
| LS05 | 同recordの取得→writer→finally候補→caller join→post退役→同backing昇格 | OP12／13、SamplerOwner／固定caller、最終TrialOwner。前record退役前に次recordなし |
| LS06 | 停止時は固定first／flag・部分生成位置・未確認参照を保持して固定終端へ合流 | OP18、発生owner→TrialOwner。clear・再取得・別profileで未確認を消さない |
| LS07 | 同borrow／custodyの確認した階層だけ退役し、未確認は同owner／固定上位へ残す | OP19、CustodyOwner／終了owner、全体TrialOwner。物理解放へ昇格せずcredit再利用なし |

先行位置へ何を書けたか、どの参照を既に取得したか、writeが完了確認済みかを区別する。candidate／finallyでの更新がthrowしても、先行slotから未確認責務が失われない設計が必要であり、本書の論理配置だけでその実装保証が成立したとはしない。先行shell・各groupの生成そのものの一時値／失敗prefixも残項に含む。

## 6 費目所有・重複防止の入口

対応キーは`同trial × schema／配置版 × profile × phase × slot／field群 × 固定操作 × occurrence`。以下の主費目を一つだけ持ち、記録先slotのowner・実行owner・全体責任ownerを分ける。親のOP分類は変更しない。

| 対象occurrence | 主費目・既存owner | 容量／保持への接続と上限の状態 |
|---|---|---|
| root／record／roleの位置・空field初期化、部分構築 | OP00、TrialOwner | LC群の位置数とLS01〜02へ対応。位置数はallocation／命令数ではない。生成work・一時値・時間係数Unknown |
| 固定供給元／provider／clock／依存の確認 | OP01、PinOwner、最終TrialOwner | 宣言・実体pin・内容照合を分離。今回実pin／scanなし。identity証拠と保持上限Unknown |
| 同Context／slot／attemptのbinding・claim | OP02、TrialOwner | LC01等の同一性。不正時も新規table／claimを作り直さない。実source coverage未確認 |
| arm clock aと予定／親期限固定 | OP03、TrialOwner | mono26／29のうち1位置。予定6位置の算出・記録も対象。clock追加なし |
| S0〜S5の入場照合・停止／phase更新 | OP04、SamplerOwner | 6予定slot。nS自体のclockはOP15。照合とclockを同じoccurrenceとして二重計上しない |
| Sの前後mono／UTCとCPU／light getter | OP05／06／07、SamplerOwner | それぞれ18 clock／6 CPU／24 light試行候補。provider戻り値・native一時領域は別項 |
| sample値検査／projection、差分、集計 | OP08／09／10、SamplerOwner | 訪問7,680／差分6,400は既存候補。wide整数・metadata検査・結果更新の追加workと容量は未導出 |
| LOAD7のL getter／mono／UTC | OP11、SamplerOwner | getter4＋mono2＋UTC1。LOAD6では0。nLのclockはOP15、追加Lなし |
| strict値・Counts・容量・sealed入力の受付 | OP12、SamplerOwner | LC03等の検査。範囲外tag・失敗保持先を含む。record全体再走査の有無と費用はUnknown |
| 同recordのbacking取得・固定encoding、Grant／Exit／post／同backing昇格 | OP13、encoding責任を持つSamplerOwner | 一度限り14／15 record試行候補。FS08と早期診断batchは排他。取得／token・各guard／join確認workは未導出 |
| packet segment構築・read role付与、notify・private receiptの開始／照合／settle | OP14、CustodyOwner、受理未確認はSamplerOwner | 同backingへの固定参照表を通知前に構築する費用を含む。notify最大1、Receipt別算定。role退役確認はOP19。queue／受信側処理・throwの費用を除外しない |
| nS／nA／nL／nN／nAck／g／i／z／z_postのclock・固定境界／診断記録 | OP15、TrialOwner | arm以外13／14 clock候補。hはnAck alias。再clock・pollなし。失敗処理全体をここへ重複計上しない |
| 最終pin／停止／鮮度／残予約guard、call入口の試行分類 | OP16／17、TrialOwner | g／iのclockはOP15、guard／分類は別occurrence。実callは未接続、試行未確認を0へしない |
| 欠測・取消・throw・容量不適合の固定失敗処理 | OP18、発生owner、最終TrialOwner | LC群／残項の保持・初回理由。正常操作が失敗した支出は元OPに残し、別の失敗処理occurrenceだけここへ |
| 上位custody・元参照／borrowの退役・TERM固定終端／終了確認 | OP19、CustodyOwner／終了owner、全体TrialOwner | receiptだけで解放としない。TERMのencodingはOP13、z／z_postのclockはOP15。未確認を維持 |

OP番号の複数併記は固定処理の別occurrenceを分類するためで、同じ操作へ二つの主費目を与える意味ではない。guard・診断・退役の各field更新がどのoccurrenceの一部かを後続source対応で固定する。親操作のinclusive時間と子操作の時間を同じ軸で再加算せず、内訳を示す場合はexclusive費と整合させる。保持byteと更新workは異なる軸なので、一度の生成後もliveのslotについてbyte保持と複数phaseの更新費を併記してよい。

LOAD6のS5後集計はR、LOAD7はL前Q、L後の検査／encoding／通知はRのまま。LS01〜03はarm前だが費用0ではない。失敗処理・TERM・解放の所属を後から外側cleanupの余りへ移さない。係数／時間配賦の根拠不足はUnknownであり、元の5秒期限・既定並列度やstrict／inclusive境界を緩めない。

## 7 最大同時保持・後続coverageへの受渡し

後続の保持算定には、L0の配置版と実装対応の有無、各fieldの生成済み／空位置、同実体alias／別copy、phase・失敗prefix・参照退役階層、残項とそのownerを一組で渡す。形式的には、列挙部分＋未列挙管理＋値／参照先＋scratch／途中値＋出力backing＋実配置差分を区分するが、同じ実体／fieldの重複を除く根拠が必要である。Unknownを含む式を数値の最大同時保持へ昇格しない。

同backing出力の13,400／14,309byteは既存条件付き包絡に限る。L0部分和、scratch20,480、wire長を足して総memory capへ適合したとはしない。先行空slotと部分生成、borrow／上位custodyで残る同参照、未確認取得・reclaimを含め、phaseごとの同時成立と実容量が後続課題である。

source coverageは、各LC／LS／OPの固定source位置・入力生成元・hook非実行・操作回数・型／容量根拠・停止／失敗時保持先・S／F／R／Aの区分を列挙して初めて確認する。本書は新しいcode照合・実coverage・合成保証を作っていない。追加clock／poll／再guardが必要なら別版でscheduleと費用を再計算する。既存getter／clock列挙62／70を全work上界へ読み替えない。

## 8 独立検証の受入条件案（未実施）

| ID | 独立対照 | 必須の期待関係 |
|---|---|---|
| SC01 | 各LC行を別field台帳から積上げ | 7管理群44／22参照、4role16／20参照、RecordCell3／3参照。参照先payloadは別 |
| SC02 | 空／非適用／不正variantと共有alias | 予約幅を消さず、別参照cellは残す。同backing payloadだけ一意に数える |
| SC03 | 2byte境界・profile cap超過・raw oversize | 範囲外拒否、clipなし。unconfirmed backingに出力包絡を適用しない |
| SC04 | Timingのmono／UTC／予定値／h alias | 26／29、6／7、予定6の位置。既存32／36観測・38／42論理位置と一致、再clockなし |
| SC05 | construction各prefix、finally／join不足・TERM非適用role | 空slot／部分生成物／未確認参照の責務を保持。次writer／再生成で救済しない |
| SC06 | 同操作をOP04と15、OP14と19、OP18と元失敗OPへ重複計上 | clock／照合・receipt／退役・元支出／失敗処理を別occurrenceへ。主費目は各一つ |
| SC07 | L0部分和だけを全slot／memory上界とする誤実装 | Context等の残項・参照先・実配置差分が未導出ならUnknown／gate閉鎖 |
| SC08 | width候補を実型・実capacity／実費確認へ昇格 | S／F／R／Aを分離し、選択・実装・実確認は未承認のまま |

oracleは対象のlayout／cost helperから期待値を生成せず、独立したfield列・幅候補・owner／phase表から検算する計画。今回は文書のリンク・表・定数式だけを静的に確認し、検査器・fixture・合成テストは実装／実行しない。

## 9 未承認事項と今回の範囲

- [ ] L0の幅・field列・参照配置候補と、未列挙残項のレビュー。
- [ ] Context／値／確認物等の全fieldと参照先容量・epoch方式の有限化。
- [ ] phase別同時保持・失敗prefix・実配置差分／allocator費の算定。
- [ ] LC／LS／OPのsource対応・主費目・回数／work／時間係数と配賦のレビュー。
- [ ] LOAD6／LOAD7・方式／容量と、実装／合成試験／実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新だけを行う。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持し、実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク17件・表21個の列数、LC01〜09／LS01〜07／SC01〜08のID連番、未承認チェック5項目、管理field列挙部分・Timing・形式部分和の定数式と、OP00〜19の記載、末尾改行・差分空白を確認した。初回の補助照合は`OP05／06／07`等の略記を展開せずOP06を未記載と誤判定した。該当行と同表の単独表記を照合して原因を確認し、補助照合側で略記を展開した再確認では全20分類を確認した。本文の費目欠落や製品テストの失敗ではない。

これらは文書・定数の静的検算のみで、実装・合成試験・負荷採取・試験再実行・実field配置／capacity／最大同時保持／費用の実証ではない。
