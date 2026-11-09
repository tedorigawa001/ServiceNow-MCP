# WF-B (C)：正規rootのgate生成・同owner結合とframe継続入口

Version: draft-0.1 / Date: 2026-11-09 / 読み取り基準HEAD: `caa6254`。

Status: **当初draft-0.1の設計に対し、正規gate先行生成・SS03同owner結合・非実行draft保持のみ合成依存限定で実装。** 実装基準HEAD `50a7d6f`、範囲と検証は§9と[検証記録](E2E_BEST_PRACTICE_WFB_CANONICAL_GATE_DRAFT_2026-11-09.md)。親は[WriterGate詳細設計](BEST_PRACTICE_WFB_WRITER_GATE_FRAME_DESIGN.md)と[同start接続差分](BEST_PRACTICE_WFB_SAME_START_SUPPLY_STOP_DESIGN.md)。旧SS03入口のreadonly descriptor結合は維持する。純粋fakeは別brand／別ownerのモデルであり、[その検証記録](E2E_BEST_PRACTICE_WFB_WRITER_GATE_FAKE_2026-11-09.md)を正規経路の停止保証へ昇格させない。

正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。文書作成時はMDのみ、今回の実装・ローカル検証は§9の限定範囲とする。実接続・実通信・設定変更・Pushは行わない。frame実行・実writer停止・Journal供給／封印・admission消費・packet生成・値capture・field clear・証拠・root終端も接続しない。以下の継続・型はOS操作や正式permitではない。

## 1 現行との差分・共通化境界

現行CanonicalSupplyConstructionは空保持slotを先行確保した後に既存CaptureAdmissionAssemblyを構築し、その同start／scope／epochをreadonlyに結合する。WriterGateModelは独立moduleで、自身のscope／frame originを発行する純粋モデルである。既存startのprepareはbinding.prepareを固定bodyとして呼ぶため、単にそのpublic methodを呼んでgate試験を始めてはならない。

配置は次の三層に分ける。

| 層 | 置くもの | 持たせないもの |
|---|---|---|
| 値kernel | gate／frame状態関係・固定理由・prefix計算の最小部分 | owner／origin発行、source／Journal、任意callback、閉鎖証拠の発行 |
| 純粋fake root | 既存WriterGateModel、独立brand／scope／台帳、旧試験 | 正規gate／grantへのcast・登録・採用口 |
| 正規lexical root | composition内の先行gate生成、同issuer／startのprivate結合、固定frame継続 | 外部から受けるstart／gate／任意body、公開token返却 |

最小抽出を行う場合も純粋fakeの結果やinstanceを正規rootへ渡さない。正規gate・pin・grantのbrandと発行slotは正規rootだけが持つ。値kernelの成功booleanは権限ではない。既存factoryの互換・未接続経路を保持し、新接続用の合成入口は固定scriptと値診断に限定する。

## 2 配置・生成順とprivate construction経路

| 段階 | 同construction内の処理・先行保持 | 拒否／未確認時 |
|---|---|---|
| RC00 | GateFailureShell、固定結果slot、grant／frame終端の空保持slotを先行確保 | shell以前の実OOM・診断必着はUnknown |
| RC01 | 既存packet／cell空保持slot等を確保し、正規gateをunboundで生成・捕捉 | 捕捉済みprefix・未捕捉gate責務を保持。issuer構築へ進まない |
| RC02 | 同gate参照をprivate construction seedへ結合し、既存issuer／同startを一度構築・捕捉 | 第2issuer／startで補完しない |
| RC03 | 正規scope／owner／pin／claim・既存epoch／packet originを同gateへ一度bind | 同値copy・別brand・別ownerは拒否。source準備0 |
| RC04 | 正規frameの固定継続descriptorを生成・先行slotへ捕捉・post確認 | 未捕捉／provisional継続を保持し、実行可能として公開しない |
| RC05 | 継続の一度限り利用slotをboundに固定し、入口準備完了 | grant未発行、frame未開始、全実writer0 |

gateは既存issuer／startの構築前に存在するが、その時点で仮ownerを与えない。issuerの既存`#epoch`／`#packetOrigin`とstartの正規owner originが得られてからbindする。constructorのfield initializerも保護区間の対象とし、途中例外で正規参照を失わないよう捕捉順を具体化する。gateを生成するために第2issuerからepochを取得しない。

`constructIssuerWithGate`相当の継続はcomposition内だけで固定し、public factoryの追加引数や任意依存注入口にはしない。同seedのgate参照はstart／bindingへ構築時に捕捉するが、unboundの間はframe開始・source生成・payload mintに使えない。将来source／controlを生成する継続には同じ正規gateだけを渡す。今回の設計入口ではそれらを生成しない。

## 3 同ownerの一度限りbind

private GateBindingPinはgate origin、正規owner origin、construction／retention／sourceSlot／回収claim origin、正規scope参照と既存capture epochを固定する。実start／source／payloadをidentityに格納しない。実startとの結合は正規rootが所有するprivate参照slotで検査し、gate自身のidentityから任意startを探さない。

受付順は、先行結果／gate捕捉確認→同seed／issuer／startの同参照→issuerが構築用unusedで既存失敗なし→正規scope参照とstart内部各field→未消費の正規回収claim→既存epoch／packet origin→gate未bind／stopなし。`captureStartAccess.scope()`のfresh wrapperと、issuerの正規`#scope`は区別する。wrapperをfield確認に使っても参照を差替えない。

preflight後、正規current／issued pinの捕捉とgate bound状態を同期固定する。再入はbinding_in_progress、確認済みbindへの重複は何も実行しないrefusalとし、pin／owner／epochを作り直さない。初回bindの混入は固定失敗として元slotを保持するが、実行資格が未発行ならそれだけでgateをunconfirmedにしない。操作／実行資格の退役未確認だけをunconfirmedへ分類する最新レビュー方針を引き継ぐ。

回収開始後のphaseでは同一の正規claimがspentである場合がある。RC03の未消費検査をそのまま後続のframe終端／drainへ再利用しない。逆にspentという値だけで別claimを採用しない。正規origin・発行slot・現在phaseを別々に照合する。

## 4 frame継続の内部型・保持と実行閉鎖

| 型案 | 正規生成元・内容 | 許可範囲 |
|---|---|---|
| GateConstructionSeed | 同root、先行gateの正規参照とconstruction origin | 同issuer／startの構築継続だけ。外部に返さない |
| BoundGateTarget | 同issuer／startのprivate参照、正規pin／scope／epoch、同gate | readonly結合確認のみ。source／Journalの採用権限ではない |
| FrameContinuationDraft | 同target、固定body variant、frame entry／exitの正規継続origin | descriptorだけ。任意関数field・外部callbackを持たない |
| ContinuationUseSlot | unused／entering／active／exiting／finished／unconfirmed、同issued draft参照 | 一度限りのframe実行開始を別管理。回収開始／供給／admission claimを消費しない |
| FrameRetentionSlot | grant・frame終端・provisional返却物・未確認継続責務 | 同ownerが外側退出まで保持。借用破棄や完了の先取りなし |

draftを返したこととframeを開始したことは別である。RC05はdescriptor確認と入口閉鎖までで、既存start.prepare／binding.prepareを呼ばない。将来、同startのframe wrapperを最小抽出して固定private bodyを選択できる境界を設ける場合も、bodyは次の二つに限る。

- **probe_only**：正規wrapperのenter／exit／再入／throw制御を試験する固定合成body。実binding.prepare・source生成・実writer・Journal操作は0。正規root内の固定継続であり、外から関数や実行scriptをbodyとして渡さない。
- **canonical_generation**：既存のbinding.prepareへ進む固定body。WG01〜WG08の停止coverageが確認されるまで新経路では恒久拒否する。probe_only成功をcoverage確認済みに変換しない。

旧未接続factoryは旧bodyを維持し、gateを任意省略する新経路を作らない。新正規rootでgate未結合／coverage未知なら、canonical_generationを呼ばず拒否する。publicな`run(callback)`、summaryからのdraft復元、mode文字列による任意body選択は設けない。

## 5 enter／exit入口と既存frameへの合流条件

**enter入口**では、同target・draft／issued同参照・継続未使用・gate open・stopなし・正規owner／pin／scope／epoch・frame未開始を確認する。unused→enteringとgeneration attempt使用済みの同期固定が開始点。grant生成→先行slotへprovisional捕捉→同参照検査→active確定の順序を守る。未捕捉grantを未発行扱いして再試行しない。

同startのwrapperだけがframe activeとgrant activeを対応付ける。純粋fakeのenter返答・`qualified_fake`・`closed_fake`を根拠にしない。再入prepare／enterは進行中のrefusalで、新grant・別frame・firstの上書きなし。bind／enterの単なる重複拒否は、後の正規退出や停止を妨げる実行未確認へ誤分類しない。

**exit入口**はexitingへ進め新leaf資格を閉じ、同grant／draft／frame・実行bodyの戻り／例外捕捉・active leafと継続の残存なし・grant退役を確認する。固定probeの正常return／throw／取消ラベルとexecution exitの確認は分離し、実source／workerの例外や取消を試験済みとは扱わない。実leaf未接続時のprobeはleafなしを確認するだけである。

現行startの`finally`で`#frameExits++`・`#frame=false`を設定する位置は、正規grant退役とexit確認へ合流させる必要がある。counterやfinally到達だけから証拠を作らず、確認済みexitを先行slotへ捕捉してからinactiveを後続drainへ知らせる。frame終了の通知と元producer成功は別で、throw後も実行退出が確認できれば元失敗を保持したままexitedにできる。退出継続／grant退役が未確認ならexit_unconfirmedである。

既存requestのstop latch・deferred処理は同frameへ合流させる。active／entering／exitingでは新frameを拒否し、後続drainは退出確認後に最大1回。既存`retirementBindingAccess.stop`がcontrol状態やproducer返答へ与える影響は、成功を保証せず元firstとして保持する。単に旧requestを2回呼んでgateとstartを個別に閉じる実装はしない。回収開始claimは既存経路だけで最大1回、供給／admission claimはここでは未消費。

## 6 失敗時の所有と保持prefix

| 失敗位置 | 正規root／同ownerの保持物 | 禁止する回復 |
|---|---|---|
| RC00以前／gate構築未捕捉 | 先行shellがあれば確保prefix・未知責務。shell以前の診断必着はUnknown | 第2gate・仮ownerによる補完 |
| issuer／start構築呼出し後未捕捉 | gate未bind・constructing slot・未知の部分構築責務 | 捕捉数0を根拠に未生成と断定 |
| RC03のpin／scope不一致 | 正規issuer／start・gate・拒否候補・先行診断 | foreign参照を正規slotへ上書き、prepare開始 |
| draft生成途中／post未確認 | 同ownerに捕捉済みtarget／draft、未捕捉継続責務 | 第2draft・第2start生成、実行口公開 |
| continuation使用開始後／grant未捕捉 | used slot・entering frame・元参照・未知grant責務 | unusedへの復元、第2grant発行 |
| body throw・exit確認済み | 元producer／probe失敗・元参照・退役済みgrantとexit記録 | 生成成功・cleanup成功への昇格 |
| exit／drain未確認 | active／exiting grant・既知／未確認継続、借用と診断 | frameをinactiveと称する、closed発行、borrow破棄 |

GateBindingPinはpayload-freeだが、private継続保持slotは同start／issuerを保持し得る。その寿命は未解決frame／借用責務より短くしない。継続を外へ返す、実startを返却値へcopyする、未確認責務を未契約custodyへ「移譲済み」とすることは禁止。後工程の固定discardも元payloadやcontrol liveの退役証拠にはしない。

結果返却・通知の故障でも保持slotを消去しない。producer／construction／binding／gate／frameのfirstと、重複refusal・未確認phaseは分離して固定する。公開診断は値だけで、origin・epoch実値、実source／start／grant参照、本文・raw例外を出さない。

## 7 独立合成受入条件（段階別の実施範囲は§9）

| ID | 狙う保証・拒否点 |
|---|---|
| GC01 | RC00〜RC05の前後faultを固定prefix表で検査。全先行slot確認前にissuer／start準備0、捕捉済みと未捕捉を分離 |
| GC02 | 同issuerの実startが1つ、gateも1つ。別brand／fakeのsummaryやinstanceからの採用0。未捕捉から第2生成なし |
| GC03 | 正規scopeとfresh wrapperの区別、start内部だけのowner／pin／claim混入・issuer状態混入を個別検査。後段guardにmaskさせない |
| GC04 | gate origin／pin各field／epoch／target／draft同値copy・余剰field・別継続を拒否。拒否候補と正規slotを保持 |
| GC05 | draft保持だけではframe／grant生成0、probe_onlyはbinding.prepare／実writer／Journal0、canonical_generationはcoverage未知で拒否 |
| GC06 | enter開始前後・grant生成／捕捉／active前後で一度限り利用と未知責務を照合。再入・重複拒否ではfirstや正常退出可能性を壊さない |
| GC07 | probe正常／throw／取消ラベル×exit確認済み／未確認を独立表で比較。finallyやcounterだけの退出成功化を拒否 |
| GC08 | request／closeをenter前・entering・active・exiting・exitedへ配置。deferredと退出後drain最大1、回収claim最大1を確認 |
| GC09 | phase前後の正規claim unused／spentを分離。別claimのspent採用と正規spentの永久拒否をそれぞれ検出 |
| GC10 | returned objectや公開callbackへgrant／draft／startを出す変異、結果故障後の保持参照消失を検出。新予算／epoch発行なし |
| GC11 | 旧fake／旧factory互換・別brand／台帳を維持。値kernelにorigin発行・実owner依存・mint callbackを持込む変異を拒否 |
| GC12 | 正規closed証拠0、WG停止coverage未確認、Journal供給0、admission消費0、packet0、field clear0、証拠0、root終端0、秘密非出力 |

oracleは本体のcounter・state表・descriptor builderから期待値をimportしない。compiledでは単独条件を外したときの拒否phase／実操作回数で検査し、冗長な等価guardと未到達条件は別記する。probe-only wrapper保証を全writer・本番runtime保証へ読み替えない。

## 8 費目・未確認事項と実装分割

正規gate／pin／target／draft／continuation-use slot／grant／各終端保持slotは各最大1。実startは同issuerが既に所有する1つで、frameを試験するため別startを作らない。先行確保・private bind／照合・frame入口／exit診断の追加費用はgate側、既存producer費用はproducer、既存回収開始／root sealは既存start／issuerに帰属させる。共有予算・停止ownerと既存D_stop／D_endを引き継ぎ、別予算や残時間起点の期限は導入しない。

実確保layout・unit係数・guard・bootstrap実E／S、constructor部分確保の全参照捕捉、escaped権限がないことの実証、既存requestと全writerへの影響はUnknown。構造枠や純粋fakeの成功を全体work受付に使用しない。

実装分割は(1)正規gateの先行生成・SS03 bindと非実行draft保持、(2)同start wrapperのprobe-only enter／exitとrequest合流、(3)全leaf／WG01〜WG08停止coverage、(4)canonical generationの検証とclosed確定、その後にJournal供給とする。(1)では(2)を起動せず、(2)でも実生成bodyを開かない。文書作成時の承認は文書化だけ。その後の限定実装(1)は§9に記録する。

今回の参照は`caa6254`の純粋fake修正、正規先行構築、既存start／issuerと親設計。新MDと親2文書のみを更新し、ビルド・試験・梱包は未実施。3文書のローカルリンク14件、RC00〜RC05の6段階、GC01〜GC12の12条件の重複・欠落なしと差分空白を確認した。文書整合の確認であり、未実装経路の試験成功ではない。未コミット、Pushなし。

## 9 限定実装：先行gate・SS03結合・非実行draft保持

上記末尾は文書作成時の記録である。`50a7d6f`からの今回の変更は`tests/review/fixtures/snapshot-read-composition-fake.ts`の同lexical rootに限り、runtime配布物へ入口を追加しない。新factory `createCanonicalGateDraftFake`は固定scriptだけを受け、値診断だけを返す。旧factoryの引数・exportは維持し、compositionの試験用export一覧だけに新factoryを追加する。

固定37段階は、1先行結果／grant／退出の空shell、2供給slot、3packet空holder、4固定field表、5〜29空cell holder、30未使用admission slot、31正規gate、32private seed、33同既存issuer／start／binding、34同target、35pinの一度限り発行／bind、36非実行draft、37未使用継続slotの順序。各段階のbefore／attempt／after／doneを記録し、後二者だけ捕捉済みと数える。constructor内部の未捕捉部分生成や実OOMまで確認済みとはしない。

同seed参照を既存issuer・start・bindingのprivate fieldへ構築時に保持する。新しいscopeやepochで補完せず、既存private target検査で同startのowner／construction／retention／sourceSlot／未消費claimとissuer unusedを照合してからpinを作る。scopeのfresh wrapperと正規参照の区別は維持する。seed・pin・draftは別brand、current／issued同参照・固定field数も検査し、外部登録口や純粋fakeからの昇格口を設けない。

draftは固定`probe_only`／`executable=false`とentry／exit originだけを保持し、関数fieldもframe runnerもない。継続slotは未使用のまま。構築中再入はrefusal、closeは構築区間のdeferred診断として扱い、既存startのprepare／request／closeは呼ばない。late close／失敗後も捕捉prefixを消さず固定拒否を返す。診断の`ready`は構築post到達の履歴であり、close後の実行許可やgate閉鎖証拠ではない。

GC01〜05の構築／結合部分、GC10〜12の非公開・互換・未接続部分を検証した。GC06〜09の実frame／grant／request合流と全writer停止coverageは未実施。37×4の独立prefix対照、29単独identity compiled対照と早期target検査の負の対照、関連1,166試験・build・strict検査・梱包確認の結果は[検証記録](E2E_BEST_PRACTICE_WFB_CANONICAL_GATE_DRAFT_2026-11-09.md)に記録する。構造上界は全体work受付ではなく、実費目・実E／S・native layout・cleanup／停止保証はUnknownのまま。
