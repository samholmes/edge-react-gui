// @flow

import type { EdgeMetaToken } from 'edge-core-js'
import { difference, keys, union } from 'lodash'
import * as React from 'react'
import { FlatList, View } from 'react-native'
import { Actions } from 'react-native-router-flux'
import { connect } from 'react-redux'

import { checkEnabledTokensArray, setWalletEnabledTokens } from '../../actions/WalletActions'
import { ADD_TOKEN, EDIT_TOKEN } from '../../constants/SceneKeys.js'
import { getSpecialCurrencyInfo, PREFERRED_TOKENS } from '../../constants/WalletAndCurrencyConstants.js'
import s from '../../locales/strings.js'
import { type RootState } from '../../types/reduxTypes.js'
import type { CustomTokenInfo, GuiWallet } from '../../types/types.js'
import * as UTILS from '../../util/utils'
import { SceneWrapper } from '../common/SceneWrapper.js'
import { WalletListModal } from '../modals/WalletListModal'
import { Airship } from '../services/AirshipInstance'
import { type Theme, type ThemeProps, cacheStyles, withTheme } from '../services/ThemeContext'
import ManageTokensHeader from '../themed/ManageTokensHeader'
import ManageTokensRow from '../themed/ManageTokensRow'
import SceneFooter from '../themed/SceneFooter'
import { SceneHeader } from '../themed/SceneHeader'
import { SecondaryButton } from '../themed/ThemedButtons'
import { getCurrencyIcon } from './../../util/CurrencyInfoHelpers'
export type ManageTokensOwnProps = {
  guiWallet: GuiWallet
}
export type ManageTokensDispatchProps = {
  setEnabledTokensList: (string, string[], string[]) => void
}

export type ManageTokensStateProps = {
  guiWallet: GuiWallet,
  wallets: { [walletId: string]: GuiWallet },
  manageTokensPending: boolean,
  settingsCustomTokens: CustomTokenInfo[]
}

type ManageTokensProps = ManageTokensOwnProps & ManageTokensDispatchProps & ManageTokensStateProps & ThemeProps

type State = {
  walletId: string,
  enabledList: string[],
  combinedCurrencyInfos: EdgeMetaToken[],
  tokens: EdgeMetaToken[],
  searchValue: string
}

class ManageTokensScene extends React.Component<ManageTokensProps, State> {
  textInput = React.createRef()

  constructor(props: ManageTokensProps) {
    super(props)

    const { enabledTokens, id } = this.props.guiWallet

    this.state = {
      walletId: id,
      enabledList: [...enabledTokens],
      combinedCurrencyInfos: [],
      tokens: this.getTokens(),
      searchValue: ''
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.guiWallet.id !== prevProps.guiWallet.id) {
      this.updateTokens()
    }
  }

  updateTokens() {
    this.setState({ tokens: this.getTokens(), enabledList: [...this.props.guiWallet.enabledTokens] })
  }

  getTokens(): EdgeMetaToken[] {
    const { metaTokens, currencyCode } = this.props.guiWallet

    const specialCurrencyInfo = getSpecialCurrencyInfo(currencyCode)

    const customTokens = this.props.settingsCustomTokens

    const accountMetaTokenInfo: CustomTokenInfo[] = specialCurrencyInfo.isCustomTokensSupported ? [...customTokens] : []

    const filteredTokenInfo = accountMetaTokenInfo.filter(token => {
      return token.walletType === this.props.guiWallet.type || token.walletType === undefined
    })

    const combinedTokenInfo = UTILS.mergeTokensRemoveInvisible(metaTokens, filteredTokenInfo)

    const sortedTokenInfo = combinedTokenInfo.sort((a, b) => {
      if (a.currencyCode < b.currencyCode) return -1
      if (a === b) return 0
      return 1
    })

    // put preferred tokens at the top
    for (const cc of PREFERRED_TOKENS) {
      const idx = sortedTokenInfo.findIndex(e => e.currencyCode === cc)
      if (idx > -1) {
        const tokenInfo = sortedTokenInfo[idx]
        sortedTokenInfo.splice(idx, 1)
        sortedTokenInfo.unshift(tokenInfo)
      }
    }

    return sortedTokenInfo
  }

  getAllowedWalletCurrencyCodes(): string[] {
    const { wallets } = this.props
    return keys(wallets).reduce((acc, key: string) => {
      const wallet = wallets[key]
      const isKey = acc.length > 0 && acc.includes(wallet.currencyCode)

      if (wallet.metaTokens.length > 0 && !isKey) {
        acc.push(wallet.currencyCode)
      }

      return acc
    }, [])
  }

  getWalletIdsIfNotTokens(): string[] {
    const { wallets } = this.props
    return keys(wallets).filter((key: string) => wallets[key].metaTokens.length === 0)
  }

  onSelectWallet = async () => {
    const { walletId, currencyCode } = await Airship.show(bridge => (
      <WalletListModal
        allowedCurrencyCodes={this.getAllowedWalletCurrencyCodes()}
        excludeWalletIds={this.getWalletIdsIfNotTokens()}
        bridge={bridge}
        headerTitle={s.strings.select_wallet}
      />
    ))

    if (walletId && currencyCode) {
      Actions.refresh({ guiWallet: this.props.wallets[walletId] })
    }
  }

  toggleToken = (currencyCode: string) => {
    const newEnabledList = this.state.enabledList
    const index = newEnabledList.indexOf(currencyCode)
    if (index >= 0) {
      newEnabledList.splice(index, 1)
    } else {
      newEnabledList.push(currencyCode)
    }
    this.setState({
      enabledList: newEnabledList
    })
  }

  getFilteredTokens = (): EdgeMetaToken[] => {
    const { searchValue, tokens } = this.state

    const RegexObj = new RegExp(searchValue, 'i')
    return tokens.filter(({ currencyCode, currencyName }) => RegexObj.test(currencyCode) || RegexObj.test(currencyName))
  }

  changeSearchValue = value => {
    this.setState({ searchValue: value })
  }

  onSearchClear = () => {
    this.setState({ searchValue: '' })
    if (this.textInput.current) {
      this.textInput.current.blur()
    }
  }

  saveEnabledTokenList = () => {
    const { id } = this.props.guiWallet
    const disabledList: string[] = []
    // get disabled list
    for (const val of this.state.combinedCurrencyInfos) {
      if (this.state.enabledList.indexOf(val.currencyCode) === -1) disabledList.push(val.currencyCode)
    }
    this.props.setEnabledTokensList(id, this.state.enabledList, disabledList)
    Actions.pop()
  }

  onDeleteToken = (currencyCode: string) => {
    const enabledListAfterDelete = difference(this.state.enabledList, [currencyCode])
    this.setState({
      enabledList: enabledListAfterDelete
    })
  }

  onAddToken = (currencyCode: string) => {
    const newEnabledList = union(this.state.enabledList, [currencyCode])
    this.setState({
      enabledList: newEnabledList
    })
  }

  goToAddTokenScene = () => {
    const { id, metaTokens } = this.props.guiWallet
    Actions[ADD_TOKEN]({
      walletId: id,
      metaTokens,
      onAddToken: this.onAddToken
    })
  }

  goToEditTokenScene = (currencyCode: string) => {
    const { id, metaTokens } = this.props.guiWallet
    Actions[EDIT_TOKEN]({
      walletId: id,
      currencyCode,
      metaTokens,
      onDeleteToken: this.onDeleteToken
    })
  }

  render() {
    const { name, currencyCode } = this.props.guiWallet
    const { manageTokensPending } = this.props

    const { theme } = this.props

    const styles = getStyles(theme)

    return (
      <SceneWrapper>
        <View style={styles.container}>
          <SceneHeader underline>
            <ManageTokensHeader
              textInput={this.textInput}
              walletName={name}
              walletId={this.props.guiWallet.id}
              currencyCode={currencyCode}
              changeSearchValue={this.changeSearchValue}
              onSearchClear={this.onSearchClear}
              onSelectWallet={this.onSelectWallet}
              searchValue={this.state.searchValue}
            />
          </SceneHeader>
          <View style={styles.tokensWrapper}>
            <View style={styles.tokensArea}>
              <FlatList
                keyExtractor={item => item.currencyCode}
                data={this.getFilteredTokens()}
                renderItem={metaToken => (
                  <ManageTokensRow
                    goToEditTokenScene={this.goToEditTokenScene}
                    metaToken={metaToken}
                    walletId={this.props.guiWallet.id}
                    symbolImage={getCurrencyIcon(currencyCode, metaToken.item.currencyCode ?? undefined).symbolImage}
                    toggleToken={this.toggleToken}
                    enabledList={this.state.enabledList}
                    metaTokens={this.props.guiWallet.metaTokens}
                  />
                )}
              />
            </View>
            <SceneFooter style={styles.buttonsArea} underline>
              <SecondaryButton
                label={s.strings.string_save}
                spinner={manageTokensPending}
                onPress={this.saveEnabledTokenList}
                marginRem={[0.75]}
                paddingRem={[0.3, 0, 0.5, 0]}
                widthRem={theme.rem(8.5)}
              />
              <SecondaryButton
                label={s.strings.addtoken_add}
                onPress={this.goToAddTokenScene}
                marginRem={[0.75]}
                paddingRem={[0.3, 0, 0.5, 0]}
                widthRem={theme.rem(8.5)}
              />
            </SceneFooter>
          </View>
        </View>
      </SceneWrapper>
    )
  }
}

const getStyles = cacheStyles((theme: Theme) => ({
  container: {
    position: 'relative',
    flex: 1
  },
  tokensWrapper: {
    flex: 1
  },
  tokensArea: {
    flex: 4
  },
  buttonsArea: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch'
  }
}))

const mapStateToProps = (state: RootState, ownProps: ManageTokensOwnProps): ManageTokensStateProps => ({
  manageTokensPending: state.ui.wallets.manageTokensPending,
  guiWallet: ownProps.guiWallet,
  settingsCustomTokens: state.ui.settings.customTokens,
  wallets: state.ui.wallets.byId
})

const mapDispatchToProps = (dispatch: Dispatch): ManageTokensDispatchProps => ({
  setEnabledTokensList: (walletId: string, enabledTokens: string[], oldEnabledTokensList: string[]) => {
    dispatch(setWalletEnabledTokens(walletId, enabledTokens, oldEnabledTokensList))
    dispatch(checkEnabledTokensArray(walletId, enabledTokens))
  }
})

export default connect(mapStateToProps, mapDispatchToProps)(withTheme(ManageTokensScene))
