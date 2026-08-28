import { useMemo, useState } from 'react'
import {
  ApartmentOutlined,
  DashboardOutlined,
  FileTextOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyCertificateOutlined,
  TableOutlined,
} from '@ant-design/icons'
import { Button, ConfigProvider, Layout, Menu, Space, Tag, Typography, theme } from 'antd'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import InvestigationPage from './pages/InvestigationPage'
import PhasePlaceholder from './components/PhasePlaceholder'

const { Header, Sider, Content } = Layout

const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/investigations', icon: <SafetyCertificateOutlined />, label: 'Investigation' },
  { key: '/explorer', icon: <TableOutlined />, label: 'Transaction Explorer' },
  { key: '/entities', icon: <ApartmentOutlined />, label: 'Entity Intelligence' },
  { key: '/reports', icon: <FileTextOutlined />, label: 'Reports' },
]

export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()

  const selectedKey = useMemo(() => {
    const match = MENU_ITEMS.find(
      (item) => item.key !== '/' && location.pathname.startsWith(item.key),
    )
    return match?.key ?? '/'
  }, [location.pathname])

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#3b82d6',
          borderRadius: 6,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sider collapsible collapsed={collapsed} trigger={null} width={230}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px' }}>
            <GlobalOutlined style={{ fontSize: 26, color: token.colorPrimary }} />
            {!collapsed && (
              <Space direction="vertical" size={0}>
                <Typography.Text strong style={{ lineHeight: 1.2 }}>
                  FraudTrace
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  SIH 26183 · Prototype
                </Typography.Text>
              </Space>
            )}
          </div>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={MENU_ITEMS}
            onClick={({ key }) => navigate(key)}
          />
        </Sider>
        <Layout>
          <Header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingInline: 16,
              background: token.colorBgContainer,
            }}
          >
            <Space>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((c) => !c)}
                aria-label="Toggle sidebar"
              />
              <Typography.Text strong>Real-Time Crypto Fraud Attribution System</Typography.Text>
            </Space>
            <Tag color="warning" bordered>
              MVP — evidence-based prototype; not an official I4C product
            </Tag>
          </Header>
          <Content style={{ margin: 16 }}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/investigations" element={<InvestigationPage />} />
              <Route path="/investigations/:id" element={<InvestigationPage />} />
              <Route
                path="/explorer"
                element={
                  <PhasePlaceholder title="Transaction Explorer" phase="Phase 4 (Investigation UI)" />
                }
              />
              <Route
                path="/entities"
                element={
                  <PhasePlaceholder title="Entity Intelligence" phase="Phase 3/4 (Attribution + UI)" />
                }
              />
              <Route
                path="/reports"
                element={<PhasePlaceholder title="Reports" phase="Phase 5 (Reports)" />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  )
}
